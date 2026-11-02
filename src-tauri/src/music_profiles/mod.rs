pub mod profile;
mod runtime;
mod sample;
use crate::{
    db::{read_track, Db, Result, TRACK_COLUMNS},
    models::Track,
};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub supported: bool,
    pub installed: bool,
    pub running: bool,
    pub enabled: bool,
    pub total: usize,
    pub analysed: usize,
    pub completed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub message: String,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub profile: profile::Profile,
    pub overrides: std::collections::BTreeMap<String, bool>,
}
#[derive(Clone)]
pub struct MusicProfiles {
    db: Db,
    status: Arc<Mutex<Status>>,
    cancel: Arc<AtomicBool>,
    app: Option<tauri::AppHandle>,
    failures: Arc<Mutex<std::collections::HashMap<String, (String, std::time::Instant)>>>,
}
impl MusicProfiles {
    pub fn new(db: Db) -> Self {
        Self {
            db,
            status: Arc::new(Mutex::new(Status::default())),
            cancel: Arc::new(AtomicBool::new(false)),
            app: None,
            failures: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }
    pub fn with_app(mut self, app: tauri::AppHandle) -> Self {
        self.app = Some(app);
        let service = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            if service
                .db
                .setting::<bool>("music.analysis.background")
                .unwrap_or(false)
                && runtime::ready(&runtime::root(&service.db))
            {
                let _ = service.start("background");
            }
        });
        self
    }
    pub fn status(&self) -> Result<Status> {
        let mut status = self
            .status
            .lock()
            .map_err(|_| "Analysis status unavailable.")?
            .clone();
        status.supported = cfg!(all(target_os = "macos", target_arch = "aarch64"));
        status.installed = runtime::ready(&runtime::root(&self.db));
        status.enabled = self
            .db
            .setting("music.analysis.background")
            .unwrap_or(false);
        let conn = self.db.connect()?;
        status.total = conn
            .query_row("SELECT count(*) FROM tracks", [], |r| r.get(0))
            .map_err(|_| "Cannot count library tracks.")?;
        status.analysed = conn
            .query_row(
                "SELECT count(*) FROM music_profiles WHERE model_version=?",
                [profile::VERSION],
                |r| r.get(0),
            )
            .map_err(|_| "Cannot count track profiles.")?;
        Ok(status)
    }
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }
    pub fn background(&self, enabled: bool) -> Result<Status> {
        self.db.set_setting("music.analysis.background", &enabled)?;
        if !enabled {
            self.cancel();
        }
        self.status()
    }
    fn message(&self, text: String) {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .message = text;
    }
    pub fn start(&self, mode: &str) -> Result<Status> {
        if !["install", "pilot", "remaining", "background"].contains(&mode) {
            return Err("Choose a valid analysis action.".into());
        }
        if mode != "install" && !runtime::ready(&runtime::root(&self.db)) {
            return Err("Install the local analyser in Settings → Music analysis first.".into());
        }
        {
            let mut status = self.status.lock().map_err(|_| "Analysis unavailable.")?;
            if status.running {
                return Err("Local music analysis is already running.".into());
            }
            *status = Status {
                running: true,
                message: if mode == "install" {
                    "Installing local analyser…"
                } else {
                    "Checking track profiles…"
                }
                .into(),
                ..Default::default()
            };
            self.cancel.store(false, Ordering::Release);
        }
        let worker = self.clone();
        let mode = mode.to_string();
        std::thread::spawn(move || {
            let result = if mode == "install" {
                runtime::install(&runtime::root(&worker.db), worker.cancel.clone(), |text| {
                    worker.message(text)
                })
            } else {
                worker.analyse(
                    if mode == "pilot" || mode == "background" {
                        20
                    } else {
                        usize::MAX
                    },
                    mode == "background",
                )
            };
            let mut status = worker.status.lock().unwrap_or_else(|e| e.into_inner());
            status.running = false;
            match result {
                Ok(()) => {
                    status.message = if mode == "install" {
                        "Local analyser ready. Start with 20 tracks.".into()
                    } else {
                        format!("Analysis finished · {} saved · {} unchanged · {} could not be analysed",status.completed,status.skipped,status.failed)
                    }
                }
                Err(_) if worker.cancel.load(Ordering::Acquire) => {
                    status.message = "Analysis cancelled. Completed profiles are kept.".into()
                }
                Err(error) => {
                    status.message = "Local analysis stopped. Completed profiles are kept.".into();
                    status.error = Some(error);
                }
            }
            if let Some(app) = &worker.app {
                use tauri::Emitter;
                let _ = app.emit("music-profiles-changed", ());
            }
        });
        self.status()
    }
    fn tracks(&self) -> Result<Vec<Track>> {
        let conn = self.db.connect()?;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {TRACK_COLUMNS} FROM tracks t ORDER BY t.added_at DESC,t.id"
            ))
            .map_err(|_| "Cannot read music library.")?;
        let rows = stmt
            .query_map([], read_track)
            .map_err(|_| "Cannot read music library.")?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "Cannot read music library.".into())
    }
    fn analyse(&self, limit: usize, background: bool) -> Result<()> {
        let mut worker = None;
        let mut consecutive_failures = 0;
        let mut attempted = 0;
        for track in self.tracks()? {
            if self.cancel.load(Ordering::Acquire) {
                return Err("Analysis cancelled.".into());
            }
            if !track.available {
                continue;
            }
            let stamp = match profile::fingerprint(&self.db, &track) {
                Ok(stamp) => stamp,
                Err(_) => {
                    self.status.lock().unwrap_or_else(|e| e.into_inner()).failed += 1;
                    continue;
                }
            };
            if background
                && self
                    .failures
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .get(&track.id)
                    .is_some_and(|(old, time)| {
                        *old == stamp && time.elapsed() < std::time::Duration::from_secs(3600)
                    })
            {
                continue;
            }
            if profile::cached(&self.db, &track)?.is_some() {
                self.status
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .skipped += 1;
                continue;
            }
            if attempted >= limit {
                break;
            }
            attempted += 1;
            let completed = self
                .status
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .completed;
            self.message(format!(
                "Analysing track {attempted} · {completed} profiles saved"
            ));
            if worker.is_none() {
                self.message("Starting local audio models…".into());
                worker = Some(
                    runtime::Worker::start(&runtime::root(&self.db), self.cancel.clone()).map_err(
                        |error| {
                            if !self.cancel.load(Ordering::Acquire) && !error.contains("timed out")
                            {
                                let _ = std::fs::remove_file(runtime::root(&self.db).join("ready"));
                            }
                            error
                        },
                    )?,
                );
            }
            let result = sample::excerpts(&self.db, &track.id, self.cancel.clone())
                .and_then(|samples| worker.as_mut().unwrap().infer(samples))
                .and_then(|value| {
                    if self.cancel.load(Ordering::Acquire) {
                        return Err("Analysis cancelled.".into());
                    }
                    profile::save(&self.db, &track.id, &stamp, &value)
                });
            match result {
                Ok(()) => {
                    self.status
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .completed += 1;
                    consecutive_failures = 0;
                }
                Err(error) => {
                    if self.cancel.load(Ordering::Acquire) {
                        return Err(error);
                    }
                    self.failures
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .insert(track.id.clone(), (stamp.clone(), std::time::Instant::now()));
                    self.status.lock().unwrap_or_else(|e| e.into_inner()).failed += 1;
                    consecutive_failures += 1;
                    if consecutive_failures >= 5 {
                        return Err(format!("Five tracks could not be analysed. {error}"));
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        Ok(())
    }
    pub fn review(&self) -> Result<Vec<Review>> {
        let conn = self.db.connect()?;
        let mut stmt=conn.prepare("SELECT track_id,profile FROM music_profiles WHERE model_version=? ORDER BY analysed_at DESC LIMIT 20").map_err(|_|"Cannot read profiles.")?;
        let rows = stmt
            .query_map([profile::VERSION], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|_| "Cannot read profiles.")?;
        let mut output = Vec::new();
        for row in rows {
            let (id, json) = row.map_err(|_| "Cannot read profiles.")?;
            let track = self.db.track(&id)?;
            if !track.available {
                continue;
            }
            let Ok(value) = serde_json::from_str::<profile::Profile>(&json) else {
                continue;
            };
            if !value.validate() || profile::cached(&self.db, &track)?.is_none() {
                continue;
            }
            let mut query = conn
                .prepare("SELECT mood,include_track FROM music_mood_overrides WHERE track_id=?")
                .map_err(|_| "Cannot read mood corrections.")?;
            let overrides = query
                .query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(|_| "Cannot read mood corrections.")?
                .collect::<std::result::Result<_, _>>()
                .map_err(|_| "Cannot read mood corrections.")?;
            output.push(Review {
                id,
                title: track.title,
                artist: track.artist,
                profile: value,
                overrides,
            });
        }
        Ok(output)
    }
    pub fn correct(&self, id: &str, mood: &str, include: Option<bool>) -> Result<()> {
        if !profile::MOODS.contains(&mood) {
            return Err("Choose a supported mood.".into());
        }
        let track = self.db.track(id)?;
        if profile::cached(&self.db, &track)?.is_none() {
            return Err("Analyse this track before correcting its mood.".into());
        }
        let conn = self.db.connect()?;
        if let Some(value) = include {
            conn.execute("INSERT INTO music_mood_overrides(track_id,mood,include_track) VALUES (?,?,?) ON CONFLICT(track_id,mood) DO UPDATE SET include_track=excluded.include_track",rusqlite::params![id,mood,value]).map_err(|_|"Cannot save mood correction.")?;
        } else {
            conn.execute(
                "DELETE FROM music_mood_overrides WHERE track_id=? AND mood=?",
                [id, mood],
            )
            .map_err(|_| "Cannot remove mood correction.")?;
        }
        Ok(())
    }
}
#[tauri::command]
pub fn music_analysis_status(state: tauri::State<'_, MusicProfiles>) -> Result<Status> {
    state.status()
}
#[tauri::command]
pub fn music_analysis_start(
    mode: String,
    state: tauri::State<'_, MusicProfiles>,
) -> Result<Status> {
    state.start(&mode)
}
#[tauri::command]
pub fn music_analysis_cancel(state: tauri::State<'_, MusicProfiles>) {
    state.cancel();
}
#[tauri::command]
pub fn music_analysis_background(
    enabled: bool,
    state: tauri::State<'_, MusicProfiles>,
) -> Result<Status> {
    state.background(enabled)
}
#[tauri::command]
pub fn music_analysis_review(state: tauri::State<'_, MusicProfiles>) -> Result<Vec<Review>> {
    state.review()
}
#[tauri::command]
pub fn music_analysis_correct(
    id: String,
    mood: String,
    include: Option<bool>,
    state: tauri::State<'_, MusicProfiles>,
) -> Result<()> {
    state.correct(&id, &mood, include)
}
#[cfg(test)]
pub(crate) mod tests;
