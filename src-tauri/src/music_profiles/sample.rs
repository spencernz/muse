use crate::{
    db::{Db, Result},
    providers::{
        remote::{open_track, CheckedReader},
        sftp_transport::SshConnector,
    },
};
use rodio::{Decoder, Source};
use std::{
    io::BufReader,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
const RATE: u32 = 16000;
/// Decode at most three 15s excerpts; no sink/output device is created.
pub fn excerpts(db: &Db, id: &str, cancel: Arc<AtomicBool>) -> Result<Vec<f32>> {
    let track = db.track(id)?;
    if !track.available {
        return Err("Track source unavailable.".into());
    }
    let mut remote_selection = None;
    let mut remote_failure = None;
    let mut source: Box<dyn Source<Item = f32> + Send> = if id.starts_with("sftp:") {
        let (file, selected) = open_track(db, id, &SshConnector)?;
        let expected: (u64, u64) = db
            .connect()?
            .query_row(
                "SELECT size,modified FROM remote_locations WHERE track_id=?",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Remote catalog unavailable.")?;
        if (file.size, file.modified) != expected {
            return Err("Remote track changed. Sync before analysing it.".into());
        }
        let size = file.size;
        let reader = CheckedReader::new(file, 32 * 1024 * 1024, cancel.clone());
        remote_failure = Some(reader.failed.clone());
        remote_selection = Some(selected);
        Box::new(
            Decoder::builder()
                .with_data(BufReader::with_capacity(64 * 1024, reader))
                .with_byte_len(size)
                .with_seekable(true)
                .build()
                .map_err(|_| "Cannot decode remote analysis sample.")?,
        )
    } else {
        Box::new(
            Decoder::try_from(
                std::fs::File::open(db.file_for(id)?).map_err(|_| "Track file unavailable.")?,
            )
            .map_err(|_| "Cannot decode analysis sample.")?,
        )
    };
    let duration = source
        .total_duration()
        .map(|d| d.as_secs_f64())
        .unwrap_or(track.duration);
    let mut samples = Vec::with_capacity(RATE as usize * 45);
    let start = Instant::now();
    let offsets = if duration >= 60. {
        vec![
            (duration * 0.18).min(duration - 16.),
            (duration * 0.48).min(duration - 16.),
            (duration * 0.78).min(duration - 16.),
        ]
    } else {
        vec![0.]
    };
    for offset in offsets {
        if cancel.load(Ordering::Acquire) {
            return Err("Analysis cancelled.".into());
        }
        if offset > 0. && source.try_seek(Duration::from_secs_f64(offset)).is_err() {
            if samples.is_empty() {
                return Err("This format cannot seek safely for local analysis.".into());
            }
            break;
        }
        let seconds = if duration >= 60. { 15 } else { 45 };
        decode_mono(source.as_mut(), seconds, &mut samples, &cancel, start)?;
    }
    if remote_failure.is_some_and(|failed| failed.load(Ordering::Acquire)) {
        return Err("Remote audio read failed. Reconnect and retry analysis.".into());
    }
    if remote_selection.is_some_and(|selected| !selected.current(db)) {
        return Err("SSH source changed during analysis.".into());
    }
    if samples.len() < RATE as usize * 6 {
        return Err("Not enough audio to analyse this track.".into());
    }
    Ok(samples)
}
struct LowPass {
    b: [f64; 3],
    a: [f64; 2],
    z: [f64; 2],
}
impl LowPass {
    fn new(rate: u32, q: f64) -> Self {
        let omega = std::f64::consts::TAU * 7000. / rate as f64;
        let cos = omega.cos();
        let alpha = omega.sin() / (2. * q);
        let a0 = 1. + alpha;
        Self {
            b: [(1. - cos) / 2. / a0, (1. - cos) / a0, (1. - cos) / 2. / a0],
            a: [-2. * cos / a0, (1. - alpha) / a0],
            z: [0.; 2],
        }
    }
    fn process(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}
fn decode_mono(
    source: &mut dyn Source<Item = f32>,
    seconds: u32,
    out: &mut Vec<f32>,
    cancel: &AtomicBool,
    start: Instant,
) -> Result<()> {
    let channels = source.channels() as usize;
    let rate = source.sample_rate();
    if channels == 0 || channels > 32 || !(8000..=384000).contains(&rate) {
        return Err("Unsupported audio layout for analysis.".into());
    }
    let mut phase = 0u64;
    let mut low_a = LowPass::new(rate.max(16001), 0.5411961);
    let mut low_b = LowPass::new(rate.max(16001), 1.306563);
    for n in 0..rate as usize * seconds as usize {
        if n % 2048 == 0
            && (cancel.load(Ordering::Acquire) || start.elapsed() > Duration::from_secs(90))
        {
            return Err("Analysis cancelled or sample read timed out.".into());
        }
        let mut sum = 0.;
        for _ in 0..channels {
            let Some(value) = source.next() else {
                return Ok(());
            };
            if !value.is_finite() {
                return Err("Invalid audio samples.".into());
            }
            sum += value;
        }
        let value = (sum / channels as f32).clamp(-1., 1.);
        let value = if rate > RATE {
            low_b.process(low_a.process(value as f64)) as f32
        } else {
            value
        };
        phase += RATE as u64;
        while phase >= rate as u64 {
            out.push(value);
            phase -= rate as u64;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downsampling_suppresses_aliasing_from_high_frequencies() {
        let energy = |hz: f32| {
            let samples: Vec<f32> = (0..48000)
                .map(|n| (std::f32::consts::TAU * hz * n as f32 / 48000.).sin() * 0.3)
                .collect();
            let mut input = rodio::buffer::SamplesBuffer::new(1, 48000, samples);
            let mut out = Vec::new();
            decode_mono(
                &mut input,
                1,
                &mut out,
                &AtomicBool::new(false),
                Instant::now(),
            )
            .unwrap();
            (out.iter().skip(512).map(|v| v * v).sum::<f32>() / (out.len() - 512) as f32).sqrt()
        };
        assert!(energy(12000.) < energy(1000.) * 0.08);
    }
    #[test]
    fn sampling_is_bounded_resampled_and_cancellable() {
        let mut input = rodio::buffer::SamplesBuffer::new(2, 48000, vec![0.25; 48000 * 2 * 3]);
        let mut out = Vec::new();
        let cancel = AtomicBool::new(false);
        decode_mono(&mut input, 1, &mut out, &cancel, Instant::now()).unwrap();
        assert_eq!(out.len(), 16000);
        assert!(out.iter().skip(512).all(|v| (*v - 0.25).abs() < 0.0001));
        cancel.store(true, Ordering::Release);
        assert!(decode_mono(&mut input, 1, &mut out, &cancel, Instant::now()).is_err());
    }
}
