//! Bounded, lock-free PCM capture; FFT runs only on requested analysis workers.
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Instant;
const CAP: usize = 8192;
const N: usize = 2048;
const RATE: f32 = 24000.;
pub struct PcmTap {
    samples: [AtomicU32; CAP],
    write: AtomicU64,
    start: AtomicU64,
    epoch: AtomicU64,
    requested: AtomicBool,
    deadline: AtomicU64,
    clock: Instant,
}
impl PcmTap {
    pub fn new() -> Self {
        Self {
            samples: std::array::from_fn(|_| AtomicU32::new(0)),
            write: AtomicU64::new(0),
            start: AtomicU64::new(0),
            epoch: AtomicU64::new(0),
            requested: AtomicBool::new(false),
            deadline: AtomicU64::new(0),
            clock: Instant::now(),
        }
    }
    pub fn set_active(&self, active: bool) {
        self.renew();
        self.requested.store(active, Ordering::Release);
        if active {
            self.reset();
        }
    }
    fn renew(&self) {
        self.deadline.store(
            self.clock.elapsed().as_millis() as u64 + 1200,
            Ordering::Relaxed,
        );
    }
    fn active(&self) -> bool {
        self.requested.load(Ordering::Relaxed)
            && (self.clock.elapsed().as_millis() as u64) < self.deadline.load(Ordering::Relaxed)
    }
    pub fn reset(&self) {
        self.start
            .store(self.write.load(Ordering::Acquire), Ordering::Release);
        self.epoch.fetch_add(1, Ordering::AcqRel);
    }
    fn push(&self, value: f32) {
        let at = self.write.load(Ordering::Relaxed);
        self.samples[at as usize % CAP].store(value.to_bits(), Ordering::Relaxed);
        self.write.store(at.wrapping_add(1), Ordering::Release);
    }
}
/// Owned by the active hardware reader. Called under its existing mixer try_lock.
pub struct TapWriter {
    tap: Arc<PcmTap>,
    ticks: usize,
    capture: bool,
    phase: bool,
    sum: f32,
}
impl TapWriter {
    pub fn new(tap: Arc<PcmTap>) -> Self {
        Self {
            tap,
            ticks: 0,
            capture: false,
            phase: false,
            sum: 0.,
        }
    }
    pub fn push(&mut self, frame: [f32; 2]) {
        if self.ticks == 0 {
            self.capture = self.tap.active();
            self.ticks = 256;
        }
        self.ticks -= 1;
        if !self.capture {
            self.phase = false;
            self.sum = 0.;
            return;
        }
        let mono = (frame[0] + frame[1]) * 0.5;
        self.sum += if mono.is_finite() { mono } else { 0. };
        if self.phase {
            self.tap.push(self.sum * 0.5);
            self.sum = 0.;
        }
        self.phase = !self.phase;
    }
}
pub struct Analysis {
    pub tap: Arc<PcmTap>,
    fft: Mutex<Fft>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFrame {
    pub track_id: Option<String>,
    pub epoch: u64,
    pub sequence: u64,
    pub available: bool,
    pub playing: bool,
    pub bands: Vec<f32>,
    pub waveform: Vec<f32>,
    /// Contiguous mono PCM resampled to44.1kHz for Butterchurn external input.
    pub pcm: Vec<f32>,
    pub rms: f32,
    pub bass: f32,
    pub mids: f32,
    pub treble: f32,
}
impl Analysis {
    pub fn new() -> Self {
        Self {
            tap: Arc::new(PcmTap::new()),
            fft: Mutex::new(Fft::new()),
        }
    }
    pub(crate) fn frame(&self, playing: bool) -> crate::db::Result<AudioFrame> {
        self.tap.renew();
        let mut fft = self
            .fft
            .lock()
            .map_err(|_| "Audio analysis is temporarily unavailable.")?;
        Ok(fft.read(&self.tap, playing))
    }
}
struct Fft {
    real: [f32; N],
    imag: [f32; N],
    window: [f32; N],
    raw: [f32; N],
}
impl Fft {
    fn new() -> Self {
        Self {
            real: [0.; N],
            imag: [0.; N],
            raw: [0.; N],
            window: std::array::from_fn(|i| {
                0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / (N - 1) as f32).cos()
            }),
        }
    }
    fn read(&mut self, tap: &PcmTap, playing: bool) -> AudioFrame {
        let epoch = tap.epoch.load(Ordering::Acquire);
        let end = tap.write.load(Ordering::Acquire);
        let start = tap.start.load(Ordering::Acquire);
        let count = end.saturating_sub(start).min(N as u64) as usize;
        let mut frame = AudioFrame {
            track_id: None,
            epoch,
            sequence: end,
            available: count > 0,
            playing,
            bands: vec![0.; 64],
            waveform: vec![0.; 128],
            pcm: vec![0.; 1024],
            rms: 0.,
            bass: 0.,
            mids: 0.,
            treble: 0.,
        };
        if !playing || count == 0 {
            return frame;
        }
        self.raw.fill(0.);
        self.imag.fill(0.);
        for i in 0..count {
            self.raw[N - count + i] = f32::from_bits(
                tap.samples[(end - count as u64 + i as u64) as usize % CAP].load(Ordering::Relaxed),
            );
        }
        for (i, sample) in frame.pcm.iter_mut().enumerate() {
            let position = (N - 1) as f32 - (1023 - i) as f32 * RATE / 44100.;
            let low = position.floor() as usize;
            let mix = position - low as f32;
            *sample = (self.raw[low] * (1. - mix) + self.raw[(low + 1).min(N - 1)] * mix).clamp(-1., 1.);
        }
        let dc = self.raw.iter().sum::<f32>() / N as f32;
        frame.rms = (self
            .raw
            .iter()
            .map(|value| (value - dc).powi(2))
            .sum::<f32>()
            / N as f32)
            .sqrt()
            .min(1.);
        for i in 0..128 {
            frame.waveform[i] = self.raw[N - 512 + i * 4..N - 512 + i * 4 + 4]
                .iter()
                .sum::<f32>()
                * 0.25;
        }
        for i in 0..N {
            self.real[i] = (self.raw[i] - dc) * self.window[i];
        }
        let mut j = 0;
        for i in 1..N {
            let mut bit = N >> 1;
            while j & bit != 0 {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if i < j {
                self.real.swap(i, j);
            }
        }
        let mut len = 2;
        while len <= N {
            let angle = -std::f32::consts::TAU / len as f32;
            let (sin, cos) = angle.sin_cos();
            for base in (0..N).step_by(len) {
                let (mut wr, mut wi) = (1., 0.);
                for k in 0..len / 2 {
                    let a = base + k;
                    let b = a + len / 2;
                    let tr = wr * self.real[b] - wi * self.imag[b];
                    let ti = wr * self.imag[b] + wi * self.real[b];
                    self.real[b] = self.real[a] - tr;
                    self.imag[b] = self.imag[a] - ti;
                    self.real[a] += tr;
                    self.imag[a] += ti;
                    let next = wr * cos - wi * sin;
                    wi = wr * sin + wi * cos;
                    wr = next;
                }
            }
            len *= 2;
        }
        for i in 1..N / 2 {
            let hz = i as f32 * RATE / N as f32;
            let amp = (self.real[i].powi(2) + self.imag[i].powi(2)).sqrt() * 4. / N as f32;
            if (30. ..250.).contains(&hz) {
                frame.bass += amp * amp * 0.5;
            } else if (250. ..2500.).contains(&hz) {
                frame.mids += amp * amp * 0.5;
            } else if (2500. ..11000.).contains(&hz) {
                frame.treble += amp * amp * 0.5;
            }
        }
        frame.bass = frame.bass.sqrt().min(1.);
        frame.mids = frame.mids.sqrt().min(1.);
        frame.treble = frame.treble.sqrt().min(1.);
        for band in 0..64 {
            let low = (30. * (10000f32 / 30.).powf(band as f32 / 64.) * N as f32 / RATE)
                .floor()
                .max(1.) as usize;
            let high = (30. * (10000f32 / 30.).powf((band + 1) as f32 / 64.) * N as f32 / RATE)
                .ceil()
                .max((low + 1) as f32)
                .min((N / 2) as f32) as usize;
            let power = (low..high)
                .map(|i| self.real[i].powi(2) + self.imag[i].powi(2))
                .sum::<f32>()
                / (high - low) as f32;
            let amplitude = power.sqrt() * 4. / N as f32;
            frame.bands[band] = ((20. * amplitude.max(0.000001).log10() + 75.) / 75.).clamp(0., 1.);
        }
        if tap.epoch.load(Ordering::Acquire) != epoch {
            frame.available = false;
            frame.bands.fill(0.);
            frame.waveform.fill(0.);
            frame.pcm.fill(0.);
            frame.rms = 0.;
            frame.bass = 0.;
            frame.mids = 0.;
            frame.treble = 0.;
        }
        frame
    }
}
#[tauri::command]
pub fn visualizer_active(active: bool, state: tauri::State<'_, crate::AppState>) {
    state.audio.analysis.tap.set_active(active);
}
#[tauri::command]
pub async fn visualizer_frame(
    state: tauri::State<'_, crate::AppState>,
) -> crate::db::Result<AudioFrame> {
    let (playing, track_id) = {
        let playback = state
            .audio
            .state
            .lock()
            .map_err(|_| "Playback state unavailable.")?;
        (
            playback.playing,
            playback.current.as_ref().map(|track| track.id.clone()),
        )
    };
    let analysis = state.audio.analysis.clone();
    tauri::async_runtime::spawn_blocking(move || {
        analysis.frame(playing).map(|mut frame| {
            frame.track_id = track_id;
            frame
        })
    })
    .await
    .map_err(|_| "Audio analysis unavailable.")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn spectrum_identifies_real_frequency_regions_and_reset_discards_old_audio() {
        for (hz, region) in [(100., 0), (1000., 1), (6000., 2)] {
            let analysis = Analysis::new();
            analysis.tap.set_active(true);
            let mut writer = TapWriter::new(analysis.tap.clone());
            for n in 0..8192 {
                let sample = (std::f32::consts::TAU * hz * n as f32 / 48000.).sin() * 0.4;
                writer.push([sample, sample]);
            }
            let frame = analysis.frame(true).unwrap();
            let values = [frame.bass, frame.mids, frame.treble];
            assert!(frame.available);
            assert!(frame.rms > 0.2);
            assert!(values[region] > 0.2);
            for (i, value) in values.iter().enumerate() {
                if i != region {
                    assert!(*value < values[region] * 0.05);
                }
            }
            analysis.tap.reset();
            assert!(!analysis.frame(true).unwrap().available);
        }
    }
    #[test]
    fn changing_pcm_updates_regions_amplitude_and_retro_samples_in_one_stream() {
        let analysis = Analysis::new();
        analysis.tap.set_active(true);
        let mut writer = TapWriter::new(analysis.tap.clone());
        let mut frames = Vec::new();
        for (hz, amplitude) in [(100., 0.15), (6000., 0.6)] {
            for n in 0..8192 {
                let sample = (std::f32::consts::TAU * hz * n as f32 / 48000.).sin() * amplitude;
                writer.push([sample, sample]);
            }
            frames.push(analysis.frame(true).unwrap());
        }
        assert!(frames[1].sequence > frames[0].sequence);
        assert_eq!(frames[0].epoch, frames[1].epoch);
        assert!(frames[0].bass > frames[0].treble * 10.);
        assert!(frames[1].treble > frames[1].bass * 10.);
        assert!(frames[1].rms > frames[0].rms * 2.);
        assert_ne!(frames[0].bands, frames[1].bands);
        assert_eq!(frames[1].pcm.len(), 1024);
        assert_ne!(frames[0].pcm, frames[1].pcm);
        assert!(frames[1].pcm.iter().all(|v| v.is_finite() && v.abs() <= 1.));
        // Frequency survives24kHz→44.1kHz conversion (zero crossings in1024 samples).
        let crossings = frames[1].pcm.windows(2).filter(|p| p[0] <= 0. && p[1] > 0.).count();
        assert!((137..=141).contains(&crossings));
        assert!(analysis.frame(false).unwrap().pcm.iter().all(|v| *v == 0.));
        analysis.tap.reset();
        assert!(analysis.frame(true).unwrap().pcm.iter().all(|v| *v == 0.));
    }
    #[test]
    fn disabled_tap_never_captures_and_pause_delivers_zero_energy() {
        let a = Analysis::new();
        let mut writer = TapWriter::new(a.tap.clone());
        for _ in 0..8192 {
            writer.push([0.4, 0.4]);
        }
        assert!(!a.frame(true).unwrap().available);
        a.tap.set_active(true);
        for _ in 0..8192 {
            writer.push([0.4, -0.2]);
        }
        let frame = a.frame(false).unwrap();
        assert_eq!(frame.rms, 0.);
        assert!(frame.bands.iter().all(|n| *n == 0.));
    }
}
