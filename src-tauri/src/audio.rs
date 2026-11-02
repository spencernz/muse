use crate::{
    db::{Db, Result},
    models::{Playback, TrackQuery},
    queue::QueueOrder,
};
use rodio::{Decoder, OutputStream, Sink};
use serde::Deserialize;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
use std::{
    fs::File,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct PlayerRequest {
    pub action: String,
    pub ids: Vec<String>,
    pub start: Option<String>,
    pub index: Option<usize>,
    pub to: Option<usize>,
    pub value: Option<f64>,
    pub mode: Option<String>,
    pub query: Option<TrackQuery>,
}
struct Message {
    request: PlayerRequest,
    reply: Option<mpsc::Sender<Result<Playback>>>,
}
#[derive(Clone)]
pub struct Audio {
    sender: mpsc::Sender<Message>,
    pub state: Arc<Mutex<Playback>>,
    pub outputs: crate::output::Outputs,
    pub analysis: Arc<crate::analysis::Analysis>,
}

impl Audio {
    pub fn start(db: Db, app: AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel();
        let mut restored: Playback = db.setting("playback").unwrap_or_default();
        restored.playing = false;
        restored.error = None;
        let state = Arc::new(Mutex::new(restored.clone()));
        let outputs = crate::output::Outputs::default();
        let analysis = Arc::new(crate::analysis::Analysis::new());
        let handle = Self {
            analysis: analysis.clone(),
            outputs: outputs.clone(),
            sender: sender.clone(),
            state: state.clone(),
        };
        // Windows SMTC requires the existing native window handle. Keep ownership
        // with Tauri; only pass its address into the audio thread.
        #[cfg(target_os = "windows")]
        let hwnd = {
            use tauri::Manager;
            app.get_webview_window("main")
                .and_then(|window| window.hwnd().ok())
                .map(|handle| handle.0 as usize)
        };
        std::thread::Builder::new()
            .name("muse-audio".into())
            .spawn(move || {
                let media_sender = sender.clone();
                let controls = MediaControls::new(PlatformConfig {
                    dbus_name: "Muse",
                    display_name: "Muse",
                    #[cfg(target_os = "windows")]
                    hwnd: hwnd.map(|handle| handle as *mut std::ffi::c_void),
                    #[cfg(not(target_os = "windows"))]
                    hwnd: None,
                })
                .ok()
                .and_then(|mut controls| {
                    controls
                        .attach(move |event| {
                            let mut request = PlayerRequest::default();
                            match event {
                                MediaControlEvent::Play => request.action = "resume".into(),
                                MediaControlEvent::Pause => request.action = "pause".into(),
                                MediaControlEvent::Toggle => request.action = "toggle".into(),
                                MediaControlEvent::Next => request.action = "next".into(),
                                MediaControlEvent::Previous => request.action = "previous".into(),
                                MediaControlEvent::Stop => request.action = "pause".into(),
                                MediaControlEvent::SetPosition(position) => {
                                    request.action = "seek".into();
                                    request.value = Some(position.0.as_secs_f64());
                                }
                                _ => return,
                            }
                            let _ = media_sender.send(Message {
                                request,
                                reply: None,
                            });
                        })
                        .ok()?;
                    Some(controls)
                });
                restored.media_controls = controls.is_some();
                let mut engine = Engine {
                    db,
                    app,
                    snapshot: state,
                    playback: restored,
                    stream: None,
                    sink: None,
                    remote: None,
                    order: QueueOrder::default(),
                    controls,
                    outputs,
                    graph: crate::output::OutputGraph::with_tap(analysis.tap.clone()),
                };
                if !engine.playback.queue.is_empty()
                    && !engine
                        .playback
                        .current
                        .as_ref()
                        .is_some_and(|t| t.id.starts_with("sftp:"))
                {
                    engine.playback.index =
                        engine.playback.index.min(engine.playback.queue.len() - 1);
                    let position = engine.playback.position;
                    if engine.load(false).is_ok() {
                        let _ = engine.seek(position);
                    } // Restore paused.
                }
                engine.publish(true);
                let mut last_save = Instant::now();
                loop {
                    match receiver.recv_timeout(Duration::from_millis(200)) {
                        Ok(message) => {
                            engine.playback.error = None;
                            let is_output=message.request.action=="output";
                            let reset_analysis=matches!(message.request.action.as_str(),"pause"|"resume"|"toggle"|"clear");
                            let result = engine.command(message.request);
                            if reset_analysis && result.is_ok() { engine.graph.tap.reset(); }
                            if let Err(error) = &result {
                                engine.playback.error = Some(error.clone());
                                if !is_output {
                                    engine.playback.playing = false;
                                    if let Some(sink) = &engine.sink {sink.pause();}
                                }
                            }
                            engine.publish(true);
                            engine.save();
                            if let Some(reply) = message.reply {
                                let _ = reply.send(result.map(|_| engine.playback.clone()));
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    if engine.graph.failed.load(std::sync::atomic::Ordering::Acquire) && engine.playback.playing {
                        engine.playback.playing=false;
                        if let Some(sink)=&engine.sink {sink.pause();}
                        engine.playback.error=Some("Audio output disconnected. Choose an available output from AirPlay / audio output, then press Play.".into());
                        engine.publish(true);
                    }
                    if let Some(remote) = &engine.remote {
                        let error = remote.error().or_else(|| {
                            (!remote.selected.current(&engine.db)).then(|| {
                                "SSH connection or folder changed. Reconnect and play again."
                                    .to_string()
                            })
                        });
                        if let Some(error) = error {
                            remote
                                .cancel
                                .store(true, std::sync::atomic::Ordering::Release);
                            if let Some(sink) = &engine.sink {
                                sink.pause();
                            }
                            if engine.playback.error.as_ref() != Some(&error) {
                                engine.playback.error = Some(error);
                                engine.playback.playing = false;
                                engine.publish(true);
                            }
                        }
                    }
                    if let Some(sink) = &engine.sink {
                        engine.playback.position = engine
                            .remote
                            .as_ref()
                            .map(|r| r.position())
                            .unwrap_or_else(|| sink.get_pos().as_secs_f64());
                        if engine.playback.playing && sink.empty() {
                            if let Err(error) = engine.advance(true) {
                                engine.playback.error = Some(error);
                                engine.playback.playing = false;
                            }
                            engine.publish(true);
                            engine.save();
                        }
                    }
                    engine.publish(false);
                    if last_save.elapsed() > Duration::from_secs(10) {
                        engine.save();
                        last_save = Instant::now();
                    }
                }
            })
            .expect("create audio thread");
        handle
    }
    // Tray commands never wait for the webview or block the native event loop.
    pub fn dispatch(&self, action: &str) {
        let _ = self.sender.send(Message {
            request: PlayerRequest {
                action: action.into(),
                ..Default::default()
            },
            reply: None,
        });
    }
    pub fn command(&self, request: PlayerRequest) -> Result<Playback> {
        let (tx, rx) = mpsc::channel();
        self.sender
            .send(Message {
                request,
                reply: Some(tx),
            })
            .map_err(|_| "Audio engine stopped.".to_string())?;
        rx.recv_timeout(Duration::from_secs(20))
            .map_err(|_| "Audio engine did not respond. Try a different file.".to_string())?
    }
}

struct Engine {
    db: Db,
    app: AppHandle,
    snapshot: Arc<Mutex<Playback>>,
    playback: Playback,
    stream: Option<OutputStream>,
    sink: Option<Arc<Sink>>,
    remote: Option<crate::remote_audio::RemoteHealth>,
    order: QueueOrder,
    controls: Option<MediaControls>,
    outputs: crate::output::Outputs,
    graph: crate::output::OutputGraph,
}
impl Engine {
    fn load(&mut self, playing: bool) -> Result<()> {
        let id = self
            .playback
            .queue
            .get(self.playback.index)
            .ok_or("Choose a track to play.")?
            .clone();
        let track = self.db.track(&id)?;
        // Prepare either input before replacing the current track. Both use the same sink.
        let (decoder, remote): (Box<dyn rodio::Source<Item = f32> + Send>, _) =
            if id.starts_with("sftp:") {
                let (source, health) = crate::remote_audio::BufferedAudio::open(&self.db, &id)?;
                (Box::new(source), Some(health))
            } else {
                let path = self.db.file_for(&id)?;
                let source = Decoder::try_from(File::open(path).map_err(|e| e.to_string())?)
                    .map_err(|e| format!("Cannot decode this audio file: {e}"))?;
                (Box::new(source), None)
            };
        if self.stream.is_none() {
            self.stream = Some(self.graph.selected_stream(&self.outputs)?);
        }
        let sink = Sink::connect_new(&self.graph.mixer);
        sink.pause();
        sink.set_volume(self.playback.volume);
        sink.append(decoder);
        if let Some(old) = self.sink.take() {
            old.stop();
        }
        if let Some(old) = self.remote.take() {
            old.cancel.store(true, std::sync::atomic::Ordering::Release);
        }
        self.graph.tap.reset();
        self.remote = remote;
        self.sink = Some(Arc::new(sink));
        self.playback.current = Some(track.clone());
        self.playback.position = 0.;
        self.playback.playing = playing;
        if playing {
            self.sink.as_ref().unwrap().play();
            self.db.played(&id);
            let _ = self.app.emit("history-changed", ());
        }
        if let Some(controls) = &mut self.controls {
            let _ = controls.set_metadata(MediaMetadata {
                title: Some(&track.title),
                artist: Some(&track.artist),
                album: Some(&track.album),
                duration: Some(Duration::from_secs_f64(track.duration.max(0.))),
                ..Default::default()
            });
        }
        Ok(())
    }
    fn advance(&mut self, natural: bool) -> Result<()> {
        let next = self.order.next(
            self.playback.queue.len(),
            self.playback.index,
            self.playback.shuffle,
            &self.playback.repeat,
            natural,
        );
        if let Some(next) = next {
            self.playback.index = next;
            self.load(true)
        } else {
            self.playback.playing = false;
            if let Some(sink) = &self.sink {
                sink.pause();
            }
            Ok(())
        }
    }
    fn seek(&mut self, value: f64) -> Result<()> {
        if !value.is_finite() {
            return Err("Invalid playback position.".into());
        }
        let duration = self
            .playback
            .current
            .as_ref()
            .map(|t| t.duration)
            .unwrap_or(0.);
        let value = if duration > 0. {
            value.clamp(0., duration)
        } else {
            value.max(0.)
        };
        if self.graph.failed.load(std::sync::atomic::Ordering::Acquire) {
            return Err("Choose an available audio output before seeking.".into());
        }
        let sink = self.sink.as_ref().ok_or("Choose a track to seek.")?.clone();
        // Rodio waits for the device callback to acknowledge seek. A disconnected
        // device must not permanently block the player control thread.
        let (tx, rx) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let _ = tx.send(
                sink.try_seek(Duration::from_secs_f64(value))
                    .map_err(|e| format!("Seeking is unavailable for this file: {e}")),
            );
        });
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(result) => result?,
            Err(_) => {
                self.graph
                    .failed
                    .store(true, std::sync::atomic::Ordering::Release);
                return Err(
                    "Audio output did not respond. Choose an available output and try again."
                        .into(),
                );
            }
        }
        self.graph.tap.reset();
        self.playback.position = value;
        Ok(())
    }
    fn command(&mut self, r: PlayerRequest) -> Result<()> {
        match r.action.as_str() {
            "refresh_metadata" => {
                if let Some(current) = self.playback.current.as_ref() {
                    self.playback.current = Some(self.db.track(&current.id)?);
                }
                if let Some(controls) = &mut self.controls {
                    let current = self.playback.current.as_ref();
                    let _ = controls.set_metadata(MediaMetadata {
                        title: current.map(|t| t.title.as_str()),
                        artist: current.map(|t| t.artist.as_str()),
                        album: current.map(|t| t.album.as_str()),
                        ..Default::default()
                    });
                }
            }
            "forget" => {
                let queue_len = self.playback.queue.len();
                let stopped = crate::models::prune_playback(&mut self.playback, &r.ids);
                if stopped {
                    if let Some(sink) = self.sink.take() {
                        sink.stop();
                    }
                    if let Some(remote) = self.remote.take() {
                        remote
                            .cancel
                            .store(true, std::sync::atomic::Ordering::Release);
                    }
                    self.playback.current = self
                        .playback
                        .queue
                        .get(self.playback.index)
                        .and_then(|id| self.db.track(id).ok());
                    if let Some(controls) = &mut self.controls {
                        let current = self.playback.current.as_ref();
                        let _ = controls.set_metadata(MediaMetadata {
                            title: current.map(|t| t.title.as_str()),
                            artist: current.map(|t| t.artist.as_str()),
                            album: current.map(|t| t.album.as_str()),
                            ..Default::default()
                        });
                    }
                }
                if self.playback.queue.len() != queue_len {
                    self.order.reset();
                }
            }
            "output" => {
                let id = r.mode.as_deref().ok_or("Choose an audio output.")?;
                let stream = self.graph.switch(&self.outputs, id)?;
                self.stream = Some(stream);
            }
            "play" => {
                let ids = if let Some(q) = r.query {
                    self.db.track_ids(&q)?
                } else {
                    r.ids
                };
                if ids.is_empty() {
                    return Err("No tracks in this collection yet.".into());
                }
                if ids.len() > 100000 {
                    return Err("Choose a smaller playback queue.".into());
                }
                self.playback.index = r
                    .start
                    .as_ref()
                    .and_then(|id| ids.iter().position(|t| t == id))
                    .unwrap_or_else(|| {
                        if r.mode.as_deref() == Some("shuffle") {
                            rand::random_range(0..ids.len())
                        } else {
                            0
                        }
                    });
                self.playback.queue = ids;
                crate::queue::configure_play_mode(&mut self.playback, r.mode.as_deref());
                self.order.reset();
                self.load(true)?;
            }
            "toggle" | "resume" | "pause" => {
                if r.action != "pause"
                    && self.graph.failed.load(std::sync::atomic::Ordering::Acquire)
                {
                    return Err("Choose an available audio output, then press Play.".into());
                }
                if (self.sink.as_ref().is_some_and(|s| s.empty())
                    || self.remote.as_ref().is_some_and(|r| {
                        r.cancel.load(std::sync::atomic::Ordering::Acquire) || r.error().is_some()
                    }))
                    && r.action != "pause"
                {
                    self.load(true)?;
                } else {
                    if self.sink.is_none() {
                        let position = self.playback.position;
                        self.load(false)?;
                        if position > 0. {
                            self.seek(position)?;
                        }
                    }
                    let sink = self.sink.as_ref().ok_or("Choose a track to play.")?;
                    let playing = if r.action == "toggle" {
                        !self.playback.playing
                    } else {
                        r.action == "resume"
                    };
                    if playing {
                        sink.play();
                    } else {
                        sink.pause();
                    }
                    self.playback.playing = playing;
                }
            }
            "next" => self.advance(false)?,
            "previous" => {
                if self.playback.position > 3. {
                    self.seek(0.)?;
                } else {
                    self.playback.index = self.order.previous(self.playback.index);
                    self.load(true)?;
                }
            }
            "seek" => self.seek(r.value.unwrap_or(0.))?,
            "volume" => {
                let value = r.value.unwrap_or(0.8);
                if !value.is_finite() {
                    return Err("Invalid volume.".into());
                }
                self.playback.volume = value.clamp(0., 1.) as f32;
                if let Some(sink) = &self.sink {
                    sink.set_volume(self.playback.volume);
                }
            }
            "shuffle" => {
                self.playback.shuffle = !self.playback.shuffle;
                self.order.reset();
            }
            "repeat" => {
                let mode = r.mode.unwrap_or_else(|| {
                    match self.playback.repeat.as_str() {
                        "off" => "all",
                        "all" => "one",
                        _ => "off",
                    }
                    .into()
                });
                if !["off", "one", "all"].contains(&mode.as_str()) {
                    return Err("Unknown repeat mode.".into());
                }
                self.playback.repeat = mode;
            }
            "append" => {
                for id in r.ids {
                    self.db.track(&id)?;
                    self.playback.queue.push(id);
                }
                self.order.reset();
            }
            "jump" => {
                let index = r.index.ok_or("Choose a queue position.")?;
                if index >= self.playback.queue.len() {
                    return Err("Queue position out of range.".into());
                }
                self.playback.index = index;
                self.load(true)?;
            }
            "remove" => {
                let i = r.index.ok_or("Choose a queue position.")?;
                if i >= self.playback.queue.len() {
                    return Err("Queue position out of range.".into());
                }
                self.playback.queue.remove(i);
                self.order.reset();
                if self.playback.queue.is_empty() {
                    self.clear();
                } else if i < self.playback.index {
                    self.playback.index -= 1;
                } else if i == self.playback.index {
                    self.playback.index = i.min(self.playback.queue.len() - 1);
                    self.load(self.playback.playing)?;
                }
            }
            "move" => {
                let (from, to) = (
                    r.index.ok_or("Choose a queue position.")?,
                    r.to.ok_or("Choose a destination.")?,
                );
                if from >= self.playback.queue.len() || to >= self.playback.queue.len() {
                    return Err("Queue position out of range.".into());
                }
                let id = self.playback.queue.remove(from);
                self.playback.queue.insert(to, id);
                if self.playback.index == from {
                    self.playback.index = to;
                } else if from < self.playback.index && to >= self.playback.index {
                    self.playback.index -= 1;
                } else if from > self.playback.index && to <= self.playback.index {
                    self.playback.index += 1;
                }
                self.order.reset();
            }
            "clear" => self.clear(),
            _ => return Err("Unknown playback action.".into()),
        }
        Ok(())
    }
    fn clear(&mut self) {
        if let Some(remote) = self.remote.take() {
            remote
                .cancel
                .store(true, std::sync::atomic::Ordering::Release);
        }
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
        self.playback.queue.clear();
        self.playback.current = None;
        self.playback.playing = false;
        self.playback.position = 0.;
        self.playback.index = 0;
        self.order.reset();
    }
    fn save(&self) {
        let _ = self.db.set_setting("playback", &self.playback);
    }
    fn publish(&mut self, full: bool) {
        if let Ok(mut state) = self.snapshot.lock() {
            if full {
                *state = self.playback.clone();
            } else {
                state.position = self.playback.position;
                state.playing = self.playback.playing;
            }
        }
        if full {
            let _ = self.app.emit("playback-changed", &self.playback);
        } else {
            let _=self.app.emit("playback-tick",serde_json::json!({"position":self.playback.position,"playing":self.playback.playing}));
        }
        if let Some(controls) = &mut self.controls {
            let progress = Some(MediaPosition(Duration::from_secs_f64(
                self.playback.position.max(0.),
            )));
            let _ = controls.set_playback(if self.playback.playing {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            });
        }
    }
}
