//! Native output routing for the existing player. No network protocol or second decoder.
use crate::db::Result;
use rodio::{
    cpal::{
        self,
        traits::{DeviceTrait, HostTrait},
    },
    mixer::{Mixer, MixerSource},
    OutputStream, OutputStreamBuilder, Source,
};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};

#[derive(Clone)]
struct Entry<D> {
    id: String,
    name: String,
    device: D,
}
struct Registry<D> {
    entries: Vec<Entry<D>>,
    selected: Option<Entry<D>>,
}
impl<D: Clone> Default for Registry<D> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            selected: None,
        }
    }
}
impl<D: Clone> Registry<D> {
    fn refresh(&mut self, devices: Vec<(String, D)>, same: impl Fn(&D, &D) -> bool) {
        let mut old = std::mem::take(&mut self.entries);
        self.entries = devices
            .into_iter()
            .map(|(name, device)| {
                let id = if let Some(i) = old.iter().position(|e| same(&e.device, &device)) {
                    old.remove(i).id
                } else {
                    uuid::Uuid::new_v4().to_string()
                };
                Entry { id, name, device }
            })
            .collect();
    }
    fn resolve(&self, id: &str) -> Result<Option<Entry<D>>> {
        if id == "system" {
            return Ok(None);
        }
        self.entries
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .map(Some)
            .ok_or_else(|| {
                "This output is no longer available. Refresh the list or choose System default."
                    .into()
            })
    }
}
fn same_device(a: &cpal::Device, b: &cpal::Device) -> bool {
    #[cfg(target_os = "macos")]
    {
        let (cpal::platform::DeviceInner::CoreAudio(a), cpal::platform::DeviceInner::CoreAudio(b)) =
            (a.as_inner(), b.as_inner());
        a == b
    }
    #[cfg(not(target_os = "macos"))]
    {
        a.name().ok() == b.name().ok()
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    id: String,
    name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputState {
    devices: Vec<OutputDevice>,
    selected: String,
    selected_name: String,
    system_default_name: Option<String>,
    airplay_supported: bool,
    available: bool,
}
#[derive(Clone, Default)]
pub struct Outputs(Arc<Mutex<Registry<cpal::Device>>>);
impl Outputs {
    pub fn refresh(&self) -> Result<OutputState> {
        let host = cpal::default_host();
        let devices = host
            .output_devices()
            .map_err(|_| "Could not list audio outputs. Refresh to try again.")?
            .take(128)
            .filter_map(|device| device.name().ok().map(|name| (name, device)))
            .collect();
        self.0
            .lock()
            .map_err(|_| "Audio output selection is unavailable.")?
            .refresh(devices, same_device);
        self.state()
    }
    pub fn state(&self) -> Result<OutputState> {
        let registry = self
            .0
            .lock()
            .map_err(|_| "Audio output selection is unavailable.")?;
        let default = cpal::default_host()
            .default_output_device()
            .and_then(|d| d.name().ok());
        let available = match &registry.selected {
            None => default.is_some(),
            Some(s) => registry.entries.iter().any(|e| e.id == s.id),
        };
        Ok(OutputState {
            devices: registry
                .entries
                .iter()
                .map(|e| OutputDevice {
                    id: e.id.clone(),
                    name: e.name.clone(),
                })
                .collect(),
            selected: registry
                .selected
                .as_ref()
                .map(|s| s.id.clone())
                .unwrap_or_else(|| "system".into()),
            selected_name: registry
                .selected
                .as_ref()
                .map(|s| s.name.clone())
                .or_else(|| default.clone())
                .unwrap_or_else(|| "No output available".into()),
            system_default_name: default,
            airplay_supported: cfg!(target_os = "macos"),
            available,
        })
    }
}

/// One persistent mixer owns the sink. Changing hardware only moves its output.
/// Each stream reads whole stereo frames; stale streams produce silence and cannot
/// drain the queue. try_lock ensures two device callbacks never wait on each other.
pub struct OutputGraph {
    pub mixer: Mixer,
    pub tap: Arc<crate::analysis::PcmTap>,
    source: Arc<Mutex<MixerSource>>,
    owner: Arc<AtomicU64>,
    next: u64,
    pub failed: Arc<AtomicBool>,
}
impl OutputGraph {
    #[cfg(test)]
    pub fn new() -> Self {
        Self::with_tap(Arc::new(crate::analysis::PcmTap::new()))
    }
    pub fn with_tap(tap: Arc<crate::analysis::PcmTap>) -> Self {
        let (mixer, source) = rodio::mixer::mixer(2, 48000);
        Self {
            tap,
            mixer,
            source: Arc::new(Mutex::new(source)),
            owner: Arc::new(AtomicU64::new(0)),
            next: 0,
            failed: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn switch(&mut self, outputs: &Outputs, id: &str) -> Result<OutputStream> {
        let choice = outputs
            .0
            .lock()
            .map_err(|_| "Audio outputs unavailable.")?
            .resolve(id)?;
        let builder = match &choice {
            Some(entry) => OutputStreamBuilder::from_device(entry.device.clone()),
            None => OutputStreamBuilder::from_default_device(),
        }
        .map_err(|_| "This output is unavailable. Connect the speaker and refresh the list.")?;
        let failed = Arc::new(AtomicBool::new(false));
        let failure = failed.clone();
        // Do not fall back to a different device if the requested route fails.
        let mut stream = builder
            .with_error_callback(move |_| failure.store(true, Ordering::Release))
            .open_stream()
            .map_err(|_| {
                "Could not connect this audio output. The previous output is still selected."
            })?;
        stream.log_on_drop(false);
        let generation = self.next.wrapping_add(1);
        stream.mixer().add(OutputReader {
            tap: crate::analysis::TapWriter::new(self.tap.clone()),
            source: self.source.clone(),
            owner: self.owner.clone(),
            generation,
            frame: [0.; 2],
            index: 0,
        });
        // Registry refresh/selection may race: revalidate before committing the switch.
        let mut registry = outputs.0.lock().map_err(|_| "Audio outputs unavailable.")?;
        if let Some(entry) = &choice {
            if !registry.entries.iter().any(|e| e.id == entry.id) {
                return Err("The output changed while connecting. Refresh and try again.".into());
            }
        }
        if failed.load(Ordering::Acquire) {
            return Err(
                "The output disconnected while connecting. The previous output is still selected."
                    .into(),
            );
        }
        registry.selected = choice;
        self.next = generation;
        self.failed = failed;
        self.owner.store(generation, Ordering::Release);
        Ok(stream)
    }
    pub fn selected_stream(&mut self, outputs: &Outputs) -> Result<OutputStream> {
        let id = outputs
            .0
            .lock()
            .map_err(|_| "Audio outputs unavailable.")?
            .selected
            .as_ref()
            .map(|e| e.id.clone())
            .unwrap_or_else(|| "system".into());
        self.switch(outputs, &id)
    }
}
struct OutputReader {
    tap: crate::analysis::TapWriter,
    source: Arc<Mutex<MixerSource>>,
    owner: Arc<AtomicU64>,
    generation: u64,
    frame: [f32; 2],
    index: usize,
}
impl Iterator for OutputReader {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.owner.load(Ordering::Acquire) != self.generation {
            return Some(0.);
        }
        if self.index == 0 {
            self.frame = if let Ok(mut source) = self.source.try_lock() {
                let frame = [source.next().unwrap_or(0.), source.next().unwrap_or(0.)];
                self.tap.push(frame);
                frame
            } else {
                [0.; 2]
            };
        }
        let sample = self.frame[self.index];
        self.index = (self.index + 1) % 2;
        Some(sample)
    }
}
impl Source for OutputReader {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        2
    }
    fn sample_rate(&self) -> u32 {
        48000
    }
    fn total_duration(&self) -> Option<std::time::Duration> {
        None
    }
}
#[tauri::command]
pub async fn audio_outputs(state: tauri::State<'_, crate::AppState>) -> Result<OutputState> {
    let outputs = state.audio.outputs.clone();
    tauri::async_runtime::spawn_blocking(move || outputs.refresh())
        .await
        .map_err(|_| "Could not list audio outputs.")?
}
#[tauri::command]
pub async fn select_audio_output(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<OutputState> {
    let audio = state.audio.clone();
    tauri::async_runtime::spawn_blocking(move || {
        audio.command(crate::audio::PlayerRequest {
            action: "output".into(),
            mode: Some(id),
            ..Default::default()
        })?;
        audio.outputs.state()
    })
    .await
    .map_err(|_| "Could not select audio output.")?
}
#[tauri::command]
pub async fn open_sound_settings() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            open::that("x-apple.systempreferences:com.apple.Sound-Settings.extension")
                .map_err(|_| "Open System Settings → Sound from the Apple menu.".into())
        })
        .await
        .map_err(|_| "Could not open Sound settings.")?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("AirPlay output discovery is available on macOS. Use your operating system's audio settings.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    #[test]
    fn registry_retains_identity_when_reordered_and_rejects_removed_or_forged_routes() {
        let mut registry = Registry::<u32>::default();
        registry.refresh(
            vec![("Speaker".into(), 1), ("Speaker".into(), 2)],
            |a, b| a == b,
        );
        let one = registry.entries[0].id.clone();
        let two = registry.entries[1].id.clone();
        assert_ne!(one, two);
        assert_eq!(registry.resolve(&two).unwrap().unwrap().device, 2);
        registry.refresh(
            vec![("Speaker".into(), 2), ("Speaker".into(), 1)],
            |a, b| a == b,
        );
        assert_eq!(registry.entries[0].id, two);
        assert_eq!(registry.entries[1].id, one);
        registry.selected = registry.resolve(&one).unwrap();
        registry.refresh(vec![("Speaker".into(), 2)], |a, b| a == b);
        assert!(registry.resolve(&one).is_err());
        assert!(registry.resolve("forged").is_err());
        assert!(registry.resolve("system").unwrap().is_none());
        assert_eq!(
            registry.selected.unwrap().id,
            one,
            "refresh must not silently change the selected route"
        );
    }
    fn reader(graph: &OutputGraph, generation: u64) -> OutputReader {
        OutputReader {
            tap: crate::analysis::TapWriter::new(graph.tap.clone()),
            source: graph.source.clone(),
            owner: graph.owner.clone(),
            generation,
            frame: [0.; 2],
            index: 0,
        }
    }
    #[test]
    fn analysis_tap_preserves_actual_output_and_does_not_read_inactive_route() {
        let analysis = crate::analysis::Analysis::new();
        analysis.tap.set_active(true);
        let graph = OutputGraph::with_tap(analysis.tap.clone());
        let samples: Vec<f32> = (0..8192)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 1000. / 48000.).sin() * 0.3;
                [sample, sample]
            })
            .collect();
        graph
            .mixer
            .add(SamplesBuffer::new(2, 48000, samples.clone()));
        graph.owner.store(1, Ordering::Release);
        let mut inactive = reader(&graph, 2);
        assert_eq!(inactive.next(), Some(0.));
        assert!(!analysis.frame(true).unwrap().available);
        let mut active = reader(&graph, 1);
        for sample in samples {
            assert_eq!(active.next(), Some(sample));
        }
        let frame = analysis.frame(true).unwrap();
        assert!(frame.available);
        assert!(frame.mids > frame.bass * 5.);
        assert!(frame.mids > frame.treble * 5.);
    }
    #[test]
    fn output_handoff_preserves_one_source_and_stereo_alignment_without_draining_to_old_devices() {
        let graph = OutputGraph::new();
        graph.mixer.add(SamplesBuffer::new(
            2,
            48000,
            vec![1., 2., 3., 4., 5., 6., 7., 8.],
        ));
        graph.owner.store(1, Ordering::Release);
        let mut old = reader(&graph, 1);
        let mut next = reader(&graph, 2);
        assert_eq!(next.next(), Some(0.));
        assert_eq!(old.next(), Some(1.));
        graph.owner.store(2, Ordering::Release);
        assert_eq!(old.next(), Some(0.));
        assert_eq!(next.next(), Some(3.));
        assert_eq!(next.next(), Some(4.));
        assert_eq!(old.next(), Some(0.));
        assert_eq!(next.next(), Some(5.));
        assert_eq!(next.next(), Some(6.));
    }
    #[test]
    fn unavailable_switch_preserves_owner_failure_flag_and_queue() {
        let mut graph = OutputGraph::new();
        let outputs = Outputs::default();
        graph.owner.store(7, Ordering::Release);
        graph
            .mixer
            .add(SamplesBuffer::new(2, 48000, vec![1., 2., 3., 4.]));
        assert!(graph.switch(&outputs, "stale-id").is_err());
        assert_eq!(graph.owner.load(Ordering::Acquire), 7);
        assert!(!graph.failed.load(Ordering::Acquire));
        let mut current = reader(&graph, 7);
        assert_eq!(current.next(), Some(1.));
        assert_eq!(current.next(), Some(2.));
    }
    #[test]
    fn concurrent_callback_contention_outputs_silence_without_waiting_or_ending() {
        let graph = OutputGraph::new();
        graph.owner.store(1, Ordering::Release);
        let mut stream = reader(&graph, 1);
        let held = graph.source.lock().unwrap();
        let start = std::time::Instant::now();
        assert_eq!(stream.next(), Some(0.));
        assert_eq!(stream.next(), Some(0.));
        assert!(start.elapsed() < std::time::Duration::from_millis(20));
        drop(held);
        graph.mixer.add(SamplesBuffer::new(2, 48000, vec![1., 2.]));
        assert_eq!(stream.next(), Some(1.));
    }
}
