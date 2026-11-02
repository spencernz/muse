//! Standard mood playlists and DJ sessions use cached local audio profiles, never OpenAI.
use crate::{
    db::{read_track, Db, Result, TRACK_COLUMNS},
    models::Track,
    music_profiles::profile,
};
use rusqlite::params;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedPlaylist {
    pub id: String,
    pub name: String,
    pub tracks: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjSession {
    pub playback: crate::models::Playback,
    pub mood: String,
    pub tracks: usize,
    pub duration: f64,
    pub shorter: bool,
}
#[derive(Clone)]
pub struct AiPlaylists {
    db: Db,
    busy: Arc<AtomicBool>,
}
struct Guard(Arc<AtomicBool>);
impl Drop for Guard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl AiPlaylists {
    pub fn new(db: Db) -> Self {
        Self {
            db,
            busy: Arc::new(AtomicBool::new(false)),
        }
    }
    fn candidates(&self, mood: &str) -> Result<Vec<(Track, f64)>> {
        if !profile::MOODS.contains(&mood) {
            return Err("Choose one of the available moods.".into());
        }
        let conn = self.db.connect()?;
        let mut stmt=conn.prepare(&format!("SELECT {TRACK_COLUMNS} FROM tracks t JOIN music_profiles mp ON mp.track_id=t.id WHERE mp.model_version=?")).map_err(|_|"Cannot read track profiles.")?;
        let rows = stmt
            .query_map([profile::VERSION], read_track)
            .map_err(|_| "Cannot read music library.")?;
        let mut query = conn
            .prepare("SELECT track_id,include_track FROM music_mood_overrides WHERE mood=?")
            .map_err(|_| "Cannot read mood corrections.")?;
        let overrides: HashMap<String, bool> = query
            .query_map([mood], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| "Cannot read mood corrections.")?
            .collect::<std::result::Result<_, _>>()
            .map_err(|_| "Cannot read mood corrections.")?;
        let mut output = Vec::new();
        for row in rows {
            let track = row.map_err(|_| "Cannot read music library.")?;
            if !track.available
                || !track.duration.is_finite()
                || track.duration < 20.
                || track.duration > 1800.
            {
                continue;
            }
            let Ok(Some(value)) = profile::cached(&self.db, &track) else {
                continue;
            };
            let score = match overrides.get(&track.id) {
                Some(false) => None,
                Some(true) => Some(0.95),
                None => profile::mood_score(&value, mood),
            };
            if let Some(score) = score {
                output.push((track, score + rand::random_range(0.0..0.035)));
            }
        }
        if output.is_empty() {
            return Err(format!("No confident {mood} matches yet. Open Settings → Music analysis to analyse more tracks or correct their moods."));
        }
        Ok(output)
    }
    pub fn select(&self, mood: &str, dj: bool) -> Result<Vec<Track>> {
        let mut pool = self.candidates(mood)?;
        let mut picked = Vec::new();
        let mut artists: HashMap<String, usize> = HashMap::new();
        let mut recordings = HashSet::new();
        let mut seconds = 0.;
        while !pool.is_empty() && picked.len() < if dj { 30 } else { 20 } {
            let best = pool
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| {
                    let value = |(t, s): &(Track, f64)| {
                        s - artists.get(&t.artist.to_lowercase()).copied().unwrap_or(0) as f64
                            * 0.12
                    };
                    value(a).total_cmp(&value(b))
                })
                .map(|(i, _)| i)
                .unwrap();
            let (track, _) = pool.swap_remove(best);
            if !recordings.insert((track.artist.to_lowercase(), track.title.to_lowercase())) {
                continue;
            }
            if dj
                && seconds >= 3300.
                && (seconds + track.duration - 3600.).abs() > (seconds - 3600.).abs()
            {
                break;
            }
            seconds += track.duration;
            *artists.entry(track.artist.to_lowercase()).or_default() += 1;
            picked.push(track);
            if dj && seconds >= 3600. {
                break;
            }
        }
        Ok(picked)
    }
    pub fn generate(&self, mood: &str) -> Result<CreatedPlaylist> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err("A playlist is already being generated.".into());
        }
        let _guard = Guard(self.busy.clone());
        let tracks = self.select(mood, false)?;
        let mut conn = self.db.connect()?;
        let tx = conn.transaction().map_err(|_| "Cannot save playlist.")?;
        let id = uuid::Uuid::new_v4().to_string();
        let name = format!("{mood} mix");
        for track in &tracks {
            let current = tx
                .query_row(
                    &format!("SELECT {TRACK_COLUMNS} FROM tracks t WHERE t.id=?"),
                    [&track.id],
                    read_track,
                )
                .map_err(|_| "Library changed. Try creating the playlist again.")?;
            if profile::cached(&self.db, &current)?.is_none() {
                return Err("Library changed. Try creating the playlist again.".into());
            }
        }
        tx.execute(
            "INSERT INTO playlists(id,name) VALUES (?,?)",
            params![id, name],
        )
        .map_err(|_| "Cannot save playlist.")?;
        for (position, track) in tracks.iter().enumerate() {
            tx.execute(
                "INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES (?,?,?)",
                params![id, track.id, position],
            )
            .map_err(|_| "Cannot save playlist tracks.")?;
        }
        tx.commit().map_err(|_| "Cannot save playlist.")?;
        Ok(CreatedPlaylist {
            id,
            name,
            tracks: tracks.len(),
        })
    }
}
#[tauri::command]
pub async fn generate_ai_playlist(
    mood: String,
    state: tauri::State<'_, AiPlaylists>,
    app: tauri::AppHandle,
) -> Result<CreatedPlaylist> {
    let service = state.inner().clone();
    let created = tauri::async_runtime::spawn_blocking(move || service.generate(&mood))
        .await
        .map_err(|_| "Could not create mood playlist.")??;
    use tauri::Emitter;
    let _ = app.emit("library-changed", ());
    Ok(created)
}
#[tauri::command]
pub async fn start_ai_dj(
    mood: String,
    state: tauri::State<'_, AiPlaylists>,
    player: tauri::State<'_, crate::AppState>,
) -> Result<DjSession> {
    let service = state.inner().clone();
    let audio = player.audio.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let tracks = service.select(&mood, true)?;
        let duration = tracks.iter().map(|t| t.duration).sum();
        let count = tracks.len();
        let playback = audio.command(crate::audio::PlayerRequest {
            action: "play".into(),
            ids: tracks.into_iter().map(|t| t.id).collect(),
            mode: Some("ordered".into()),
            ..Default::default()
        })?;
        Ok(DjSession {
            playback,
            mood,
            tracks: count,
            duration,
            shorter: duration < 3300.,
        })
    })
    .await
    .map_err(|_| "Could not start AI DJ.")?
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::music_profiles::{
        tests::{calm, fixture},
        MusicProfiles,
    };
    #[test]
    fn saved_mix_is_local_bounded_and_excludes_high_energy_stale_and_disconnected_tracks() {
        let (dir, db) = fixture(28);
        let service = AiPlaylists::new(db.clone());
        let mut energetic = calm();
        energetic.relaxed = 0.1;
        energetic.energy = 0.9;
        energetic.danceable = 0.95;
        let track = db.track("track-0").unwrap();
        profile::save(
            &db,
            &track.id,
            &profile::fingerprint(&db, &track).unwrap(),
            &energetic,
        )
        .unwrap();
        std::fs::write(dir.path().join("1.wav"), "stale file changed").unwrap();
        let selected = service.select("Chill", false).unwrap();
        assert_eq!(selected.len(), 20);
        assert!(selected
            .iter()
            .all(|t| t.id != "track-0" && t.id != "track-1"));
        let counts = selected
            .iter()
            .fold(HashMap::<String, usize>::new(), |mut counts, t| {
                *counts.entry(t.artist.clone()).or_default() += 1;
                counts
            });
        assert!(counts.values().all(|v| *v <= 6));
        let playlist = service.generate("Chill").unwrap();
        assert_eq!(playlist.tracks, 20);
        assert_eq!(db.library().unwrap().playlists.len(), 1);
        db.connect()
            .unwrap()
            .execute("UPDATE sources SET available=0", [])
            .unwrap();
        assert!(service.generate("Chill").is_err());
    }
    #[test]
    fn dj_targets_an_hour_without_saving_a_playlist_and_small_libraries_return_shorter() {
        let (_dir, db) = fixture(40);
        let service = AiPlaylists::new(db.clone());
        let queue = service.select("Chill", true).unwrap();
        assert_eq!(queue.len(), 20);
        assert_eq!(queue.iter().map(|t| t.duration).sum::<f64>(), 3600.);
        assert!(db.library().unwrap().playlists.is_empty());
        let (_small, db) = fixture(2);
        assert_eq!(AiPlaylists::new(db).select("Chill", true).unwrap().len(), 2);
    }
    #[test]
    fn corrections_override_eligibility_without_mutating_models_and_invalid_moods_fail() {
        let (_dir, db) = fixture(2);
        let service = AiPlaylists::new(db.clone());
        let profiles = MusicProfiles::new(db.clone());
        profiles.correct("track-0", "Chill", Some(false)).unwrap();
        let result = service.select("Chill", false).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "track-1");
        profiles.correct("track-0", "Chill", Some(true)).unwrap();
        assert_eq!(service.select("Chill", false).unwrap().len(), 2);
        assert!(service.generate("invalid").is_err());
    }
    #[test]
    fn incomplete_playlist_save_rolls_back_all_members() {
        let (_dir, db) = fixture(3);
        db.connect().unwrap().execute_batch("CREATE TRIGGER fail_local_playlist BEFORE INSERT ON playlist_tracks WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT,'synthetic'); END;").unwrap();
        assert!(AiPlaylists::new(db.clone()).generate("Chill").is_err());
        assert!(db.library().unwrap().playlists.is_empty());
    }
}
