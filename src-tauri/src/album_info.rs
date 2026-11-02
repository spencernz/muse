//! Album-level AI identification, catalog verification and locally retained artwork/metadata.
use crate::{
    ai::{AiConnection, AlbumContext, AlbumHint},
    db::{now, Db, Result},
    models::TrackQuery,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub tracks: u32,
    pub edition: String,
    pub score: u32,
}
pub trait AlbumCatalog: Send + Sync {
    fn search(&self, hint: &AlbumHint) -> Result<Vec<Match>>;
    fn cover(&self, id: &str) -> Result<Option<Vec<u8>>>;
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPreview {
    pub id: String,
    pub album_id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub genre: String,
    pub cover: Option<String>,
    pub new_cover: bool,
    pub source: String,
    pub warning: Option<String>,
}
struct Pending {
    preview: AlbumPreview,
    tracks: Vec<String>,
    original_cover: Option<String>,
    release_id: String,
    expires: i64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumEdits {
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub genre: String,
    pub apply_cover: bool,
}
#[derive(Clone)]
pub struct AlbumInfo {
    db: Db,
    ai: AiConnection,
    catalog: Arc<dyn AlbumCatalog>,
    pending: Arc<Mutex<BTreeMap<String, Pending>>>,
    busy: Arc<AtomicBool>,
    identities: Arc<Mutex<BTreeMap<String, (Instant, AlbumHint)>>>,
}
struct Busy(Arc<AtomicBool>);
impl Drop for Busy {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl AlbumInfo {
    pub fn new(db: Db, ai: AiConnection, catalog: Arc<dyn AlbumCatalog>) -> Self {
        Self {
            db,
            ai,
            catalog,
            pending: Arc::new(Mutex::new(BTreeMap::new())),
            busy: Arc::new(AtomicBool::new(false)),
            identities: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }
    pub fn search(&self, id: &str) -> Result<AlbumPreview> {
        if self.busy.swap(true, Ordering::AcqRel) {
            return Err("An album lookup is already running. Wait for it to finish.".into());
        }
        let _busy = Busy(self.busy.clone());
        let library = self.db.library()?;
        let album = library
            .albums
            .iter()
            .find(|a| a.id == id)
            .ok_or("This album is no longer in your library.")?;
        let tracks = self.db.track_ids(&TrackQuery {
            album_id: Some(id.into()),
            sort: "album".into(),
            ..Default::default()
        })?;
        let sample = self.db.tracks(&TrackQuery {
            album_id: Some(id.into()),
            sort: "album".into(),
            limit: 32,
            ..Default::default()
        })?;
        let context = AlbumContext {
            title: album.title.chars().take(160).collect(),
            artist: album.artist.chars().take(160).collect(),
            year: album.year.filter(|y| (1800..=2200).contains(y)),
            tracks: sample
                .items
                .into_iter()
                .map(|t| t.title.chars().take(120).collect())
                .collect(),
        };
        let started = Instant::now();
        let cache_key = serde_json::to_string(&(self.ai.model(), &context))
            .map_err(|_| "Cannot prepare album context.")?;
        let cached = {
            let mut cache = self
                .identities
                .lock()
                .map_err(|_| "Album lookup is busy.")?;
            cache.retain(|_, (at, _)| at.elapsed() < Duration::from_secs(900));
            cache.get(&cache_key).map(|(_, hint)| hint.clone())
        };
        let hint = if let Some(hint) = cached {
            hint
        } else {
            let hint = self.ai.identify_album(&context)?;
            let mut cache = self
                .identities
                .lock()
                .map_err(|_| "Album lookup is busy.")?;
            if cache.len() >= 32 {
                cache.clear();
            }
            cache.insert(cache_key, (Instant::now(), hint.clone()));
            hint
        };
        let mut matches = self.catalog.search(&hint)?;
        matches.sort_by_key(|m| {
            std::cmp::Reverse(
                m.score as i64
                    + if m.tracks == album.tracks as u32 {
                        40
                    } else {
                        0
                    }
                    + if m.year == hint.year && m.year.is_some() {
                        10
                    } else {
                        0
                    }
                    + if !hint.edition.is_empty()
                        && m.edition
                            .to_lowercase()
                            .contains(&hint.edition.to_lowercase())
                    {
                        15
                    } else {
                        0
                    },
            )
        });
        let mut chosen=matches.first().cloned().ok_or("AI identified the album, but no verified catalog match was found. Check the album title/artist and try again.")?;
        let mut cover = None;
        let mut warning = None;
        for candidate in matches.iter().take(3) {
            if started.elapsed() > Duration::from_secs(60) {
                break;
            }
            match self.catalog.cover(&candidate.id) {
                Ok(Some(bytes)) => {
                    if let Ok(path) = crate::metadata::cache_cover(&bytes, &self.db) {
                        cover = Some(path);
                        chosen = candidate.clone();
                        break;
                    }
                }
                Ok(None) => {}
                Err(_) => {
                    warning = Some(
                        "Artwork lookup is unavailable. The existing cover will be kept.".into(),
                    )
                }
            }
        }
        if cover.is_none() && warning.is_none() {
            warning = Some(
                "No cover is available for this match. The existing cover will be kept.".into(),
            );
        }
        let preview = AlbumPreview {
            id: uuid::Uuid::new_v4().to_string(),
            album_id: id.into(),
            title: chosen.title,
            artist: chosen.artist,
            year: chosen.year.or(album.year),
            genre: album.genre.clone(),
            new_cover: cover.is_some(),
            cover: cover.or_else(|| album.cover.clone()),
            source: "MusicBrainz / Cover Art Archive".into(),
            warning,
        };
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "Cannot prepare album preview.")?;
        pending.retain(|_, p| p.expires > now());
        if pending.len() >= 16 {
            pending.clear();
        }
        pending.insert(
            preview.id.clone(),
            Pending {
                preview: preview.clone(),
                tracks,
                original_cover: album.cover.clone(),
                release_id: chosen.id,
                expires: now() + 900,
            },
        );
        Ok(preview)
    }
    pub fn discard(&self, id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(id);
        }
    }
    pub fn apply(&self, id: &str, edits: AlbumEdits) -> Result<()> {
        for value in [&edits.title, &edits.artist, &edits.genre] {
            if value.chars().count() > 512 || value.chars().any(char::is_control) {
                return Err(
                    "Enter valid album information (up to 512 characters per field).".into(),
                );
            }
        }
        if edits.title.trim().is_empty()
            || edits.artist.trim().is_empty()
            || edits.year.is_some_and(|y| !(1800..=2200).contains(&y))
        {
            return Err("Enter an album title, artist and valid year.".into());
        }
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "Cannot apply album preview.")?;
        let preview = pending
            .get(id)
            .filter(|p| p.expires > now())
            .ok_or("This album preview expired. Search again.")?;
        let current = self.db.track_ids(&TrackQuery {
            album_id: Some(preview.preview.album_id.clone()),
            sort: "album".into(),
            ..Default::default()
        })?;
        let mut a = current;
        let mut b = preview.tracks.clone();
        a.sort();
        b.sort();
        if a != b || a.is_empty() {
            return Err(
                "The album changed since this preview. Search again before applying.".into(),
            );
        }
        let cover = if edits.apply_cover {
            preview.preview.cover.as_ref()
        } else {
            preview.original_cover.as_ref()
        };
        let mut conn = self.db.connect()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let snapshot: Vec<String> = tx
            .prepare("SELECT id FROM tracks WHERE album_id=? ORDER BY id")
            .map_err(|e| e.to_string())?
            .query_map([&preview.preview.album_id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| e.to_string())?;
        if snapshot != a {
            return Err("The album changed during preview. Search again.".into());
        }
        tx.execute("INSERT INTO album_overrides(id,title,artist,year,genre,cover,release_id,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,year=excluded.year,genre=excluded.genre,cover=excluded.cover,release_id=excluded.release_id,updated_at=excluded.updated_at",params![preview.preview.album_id,edits.title.trim(),edits.artist.trim(),edits.year,edits.genre.trim(),cover,preview.release_id,now()]).map_err(|e|e.to_string())?;
        for track in &a {
            tx.execute("INSERT INTO track_album_overrides(track_id,album_id) VALUES (?,?) ON CONFLICT(track_id) DO UPDATE SET album_id=excluded.album_id",params![track,preview.preview.album_id]).map_err(|e|e.to_string())?;
        }
        crate::catalog::reapply_overrides(&tx, None)?;
        tx.commit().map_err(|e| e.to_string())?;
        pending.remove(id);
        Ok(())
    }
}
pub struct MusicBrainzCatalog {
    last: Mutex<Option<Instant>>,
}
impl Default for MusicBrainzCatalog {
    fn default() -> Self {
        Self {
            last: Mutex::new(None),
        }
    }
}
fn mbid(id: &str) -> Result<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| "The music catalog returned an invalid album identity.".into())
}
fn cover_url(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && url.host_str().is_some_and(|h| {
            h == "coverartarchive.org" || h == "archive.org" || h.ends_with(".archive.org")
        })
}
fn quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
fn artist(value: &Value) -> String {
    value
        .get("artist-credit")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|c| {
            c.get("name").and_then(Value::as_str).map(|name| {
                format!(
                    "{}{}",
                    name,
                    c.get("joinphrase").and_then(Value::as_str).unwrap_or("")
                )
            })
        })
        .collect::<String>()
}
fn parse_matches(value: Value) -> Result<Vec<Match>> {
    let values = value
        .get("releases")
        .and_then(Value::as_array)
        .ok_or("The music catalog returned unreadable album data.")?;
    let mut result = vec![];
    for value in values.iter().take(8) {
        let Some(id) = value.get("id").and_then(Value::as_str) else {
            continue;
        };
        if mbid(id).is_err() {
            continue;
        }
        let title = value.get("title").and_then(Value::as_str).unwrap_or("");
        let artist = artist(value);
        if title.is_empty()
            || title.chars().count() > 512
            || artist.is_empty()
            || artist.chars().count() > 512
        {
            continue;
        }
        let year = value
            .get("date")
            .and_then(Value::as_str)
            .and_then(|d| d.get(..4))
            .and_then(|d| d.parse::<i32>().ok())
            .filter(|y| (1800..=2200).contains(y));
        let tracks = value
            .get("track-count")
            .and_then(Value::as_u64)
            .or_else(|| {
                value.get("media").and_then(Value::as_array).map(|m| {
                    m.iter()
                        .filter_map(|v| v.get("track-count").and_then(Value::as_u64))
                        .sum()
                })
            })
            .unwrap_or(0)
            .min(10000) as u32;
        let score = value
            .get("score")
            .and_then(Value::as_u64)
            .or_else(|| {
                value
                    .get("score")
                    .and_then(Value::as_str)
                    .and_then(|s| s.parse().ok())
            })
            .unwrap_or(0)
            .min(100) as u32;
        result.push(Match {
            id: id.into(),
            title: title.into(),
            artist,
            year,
            tracks,
            edition: value
                .get("disambiguation")
                .and_then(Value::as_str)
                .unwrap_or("")
                .chars()
                .take(512)
                .collect(),
            score,
        });
    }
    Ok(result)
}

struct CatalogReply {
    status: u16,
    retry_after: Option<u64>,
    deferred: bool,
    data: Option<Value>,
}
// Retry only public catalog GETs. Never retry the paid identification request here.
fn catalog_request(
    mut fetch: impl FnMut() -> Result<CatalogReply>,
    mut wait: impl FnMut(Duration),
) -> Result<Vec<Match>> {
    for attempt in 0..3 {
        let reply = fetch()?;
        if (200..300).contains(&reply.status) {
            return parse_matches(
                reply
                    .data
                    .ok_or("The music catalog returned unreadable album data.")?,
            );
        }
        let transient = matches!(reply.status, 429 | 500 | 502 | 503 | 504);
        if transient
            && attempt < 2
            && !reply.deferred
            && reply.retry_after.is_none_or(|seconds| seconds <= 8)
        {
            wait(Duration::from_secs(
                reply.retry_after.unwrap_or(2 << attempt),
            ));
            continue;
        }
        return Err(match reply.status {
            429 => {
                "The music catalog is rate limited (HTTP 429). Wait a while before trying again."
                    .into()
            }
            500 | 502 | 503 | 504 => format!(
                "The music catalog is temporarily unavailable (HTTP {}). Try again later.",
                reply.status
            ),
            code => format!("The music catalog rejected the lookup (HTTP {code})."),
        });
    }
    unreachable!()
}
impl AlbumCatalog for MusicBrainzCatalog {
    fn search(&self, hint: &AlbumHint) -> Result<Vec<Match>> {
        let query = format!(
            "release:{} AND artist:{}",
            quoted(&hint.title),
            quoted(&hint.artist)
        );
        let mut url = url::Url::parse("https://musicbrainz.org/ws/2/release/")
            .map_err(|_| "Invalid catalog address.")?;
        url.query_pairs_mut()
            .append_pair("query", &query)
            .append_pair("fmt", "json")
            .append_pair("limit", "8");
        catalog_request(
            || {
                {
                    let mut last = self.last.lock().map_err(|_| "Music catalog is busy.")?;
                    if let Some(at) = *last {
                        let wait = Duration::from_millis(1100).saturating_sub(at.elapsed());
                        if !wait.is_zero() {
                            std::thread::sleep(wait);
                        }
                    }
                    *last = Some(Instant::now());
                }

                let response = crate::ai::client()?
                    .get(url.clone())
                    .timeout(Duration::from_secs(12))
                    .send()
                    .map_err(|_| "Could not reach the music catalog. Try again.")?;
                let status = response.status().as_u16();
                let header = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|v| v.to_str().ok());
                let retry_after = header.and_then(|v| v.trim().parse::<u64>().ok());
                let deferred = header.is_some() && retry_after.is_none();
                let data = if (200..300).contains(&status) {
                    Some(
                        serde_json::from_slice(&crate::ai::bytes(response, 2 * 1024 * 1024)?)
                            .map_err(|_| "The music catalog returned unreadable album data.")?,
                    )
                } else {
                    None
                };
                Ok(CatalogReply {
                    status,
                    retry_after,
                    deferred,
                    data,
                })
            },
            std::thread::sleep,
        )
    }
    fn cover(&self, id: &str) -> Result<Option<Vec<u8>>> {
        mbid(id)?;
        let mut url = url::Url::parse(&format!(
            "https://coverartarchive.org/release/{id}/front-500"
        ))
        .map_err(|_| "Invalid artwork request.")?;
        let client = crate::ai::client()?;
        let deadline = Instant::now() + Duration::from_secs(20);
        for _ in 0..5 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err("Artwork lookup timed out.".into());
            }
            if !cover_url(&url) {
                return Err("Artwork service redirected outside its allowed hosts.".into());
            }
            let response = client
                .get(url.clone())
                .timeout(remaining.min(Duration::from_secs(8)))
                .send()
                .map_err(|_| "Artwork connection unavailable.")?;
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                return Ok(None);
            }
            if response.status().is_redirection() {
                let next = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or("Invalid artwork redirect.")?;
                url = url.join(next).map_err(|_| "Invalid artwork redirect.")?;
                continue;
            }
            if !response.status().is_success() {
                return Err("Artwork service unavailable.".into());
            }
            return crate::ai::bytes(response, 8 * 1024 * 1024).map(Some);
        }
        Err("Too many artwork redirects.".into())
    }
}
#[tauri::command]
pub async fn search_album_info(
    album_id: String,
    state: tauri::State<'_, AlbumInfo>,
) -> Result<AlbumPreview> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.search(&album_id))
        .await
        .map_err(|_| "Could not search album information.")?
}
#[tauri::command]
pub fn discard_album_preview(id: String, state: tauri::State<'_, AlbumInfo>) {
    state.discard(&id);
}
#[tauri::command]
pub async fn apply_album_info(
    id: String,
    edits: AlbumEdits,
    state: tauri::State<'_, AlbumInfo>,
    app_state: tauri::State<'_, crate::AppState>,
    app: tauri::AppHandle,
) -> Result<()> {
    let service = state.inner().clone();
    let audio = app_state.audio.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        service.apply(&id, edits)?;
        audio.dispatch("refresh_metadata");
        Ok(())
    })
    .await
    .map_err(|_| "Could not apply album information.")??;
    use tauri::Emitter;
    let _ = app.emit("library-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{
        tests::{Vault, Wire},
        DEFAULT_MODEL,
    };
    use std::io::Cursor;
    struct Catalog {
        fail: AtomicBool,
        no_cover: AtomicBool,
    }
    impl AlbumCatalog for Catalog {
        fn search(&self, _: &AlbumHint) -> Result<Vec<Match>> {
            if self.fail.load(Ordering::Acquire) {
                return Err("Catalog unavailable.".into());
            }
            Ok(vec![Match {
                id: "76df3287-6cda-33eb-8e9a-044b5e15ffdd".into(),
                title: "Verified album".into(),
                artist: "Verified artist".into(),
                year: Some(2025),
                tracks: 2,
                edition: "".into(),
                score: 100,
            }])
        }
        fn cover(&self, _: &str) -> Result<Option<Vec<u8>>> {
            if self.no_cover.load(Ordering::Acquire) {
                return Ok(None);
            }
            let mut bytes = Cursor::new(vec![]);
            image::DynamicImage::new_rgb8(8, 8)
                .write_to(&mut bytes, image::ImageFormat::Png)
                .unwrap();
            Ok(Some(bytes.into_inner()))
        }
    }
    fn setup() -> (tempfile::TempDir, Db, AlbumInfo, Arc<Catalog>) {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::new(dir.path()).unwrap();
        let conn = db.connect().unwrap();
        conn.execute("INSERT INTO sources(id,path) VALUES('local','/music')", [])
            .unwrap();
        for id in ["one", "two"] {
            conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,year,genre,duration,track_no,disc_no,added_at) VALUES (?,'Song','Artist','Old album','Artist','album',2026,'Pop',180,1,1,1)",[id]).unwrap();
            conn.execute("INSERT INTO locations(path,track_id,source_id,size,modified,hash,generation) VALUES (?,?,'local',1,'1',?,'g')",params![format!("/music/{id}.mp3"),id,id]).unwrap();
        }
        let ai = AiConnection::new(
            db.clone(),
            Arc::new(Vault::default()),
            Arc::new(Wire::default()),
        );
        ai.save(
            DEFAULT_MODEL.into(),
            Some("sk-synthetic-only-test-key".into()),
        )
        .unwrap();
        let catalog = Arc::new(Catalog {
            fail: AtomicBool::new(false),
            no_cover: AtomicBool::new(false),
        });
        let service = AlbumInfo::new(db.clone(), ai, catalog.clone());
        (dir, db, service, catalog)
    }
    #[test]
    fn catalog_retry_reuses_identity_but_metadata_and_model_changes_invalidate_it() {
        let (_dir, db, mut service, catalog) = setup();
        let wire = Arc::new(Wire::default());
        service.ai = AiConnection::new(
            db.clone(),
            Arc::new(Vault(Mutex::new(Some("sk-synthetic-only-test-key".into())))),
            wire.clone(),
        );
        catalog.fail.store(true, Ordering::Release);
        assert!(service.search("album").is_err());
        assert!(service.search("album").is_err());
        assert_eq!(wire.requests.lock().unwrap().len(), 1);
        db.connect()
            .unwrap()
            .execute("UPDATE tracks SET album='Changed album'", [])
            .unwrap();
        assert!(service.search("album").is_err());
        assert_eq!(wire.requests.lock().unwrap().len(), 2);
        service.ai.save("gpt-5-nano".into(), None).unwrap();
        assert!(service.search("album").is_err());
        assert_eq!(wire.requests.lock().unwrap().len(), 3);
    }
    #[test]
    fn catalog_retries_are_bounded_and_respect_long_or_unknown_retry_after() {
        for (status, delay, deferred, expected) in [
            (503, None, false, 3),
            (401, None, false, 1),
            (429, Some(60), false, 1),
            (503, None, true, 1),
        ] {
            let mut calls = 0;
            let mut waits = Vec::new();
            let result = catalog_request(
                || {
                    calls += 1;
                    Ok(CatalogReply {
                        status,
                        retry_after: delay,
                        deferred,
                        data: None,
                    })
                },
                |delay| waits.push(delay),
            );
            assert!(result.err().unwrap().contains(&status.to_string()));
            assert_eq!(calls, expected);
            assert_eq!(waits.len(), expected - 1);
        }
    }
    fn edits() -> AlbumEdits {
        AlbumEdits {
            title: "Reviewed title".into(),
            artist: "Reviewed artist".into(),
            year: Some(2025),
            genre: "Soul".into(),
            apply_cover: true,
        }
    }
    #[test]
    fn preview_does_not_apply_until_review_and_overrides_survive_source_tag_updates() {
        let (dir, db, service, _) = setup();
        let preview = service.search("album").unwrap();
        assert!(preview.new_cover);
        assert!(std::path::Path::new(preview.cover.as_ref().unwrap()).starts_with(&db.artwork));
        assert_eq!(db.track("one").unwrap().album, "Old album");
        db.favourite("one", true).unwrap();
        let list = db
            .playlist("create", None, Some("Keep"), vec![])
            .unwrap()
            .unwrap();
        db.playlist("add", Some(&list), None, vec!["one".into()])
            .unwrap();
        service.apply(&preview.id, edits()).unwrap();
        let one = db.track("one").unwrap();
        assert_eq!(one.album_id, "album");
        assert_eq!(one.album, "Reviewed title");
        assert_eq!(one.album_artist, "Reviewed artist");
        assert_eq!(one.artist, "Artist");
        assert!(one.liked);
        assert!(one.cover.is_some());
        assert_eq!(db.library().unwrap().playlists[0].tracks, 1);
        let conn = db.connect().unwrap();
        conn.execute("UPDATE tracks SET album_id='new-tags',album='Remote changed title',album_artist='Remote changed artist',cover=NULL",[]).unwrap();
        crate::catalog::reapply_overrides(&conn, None).unwrap();
        assert_eq!(db.track("one").unwrap().album, "Reviewed title");
        assert_eq!(db.track("one").unwrap().cover, one.cover);
        drop(conn);
        let reopened = Db::new(dir.path()).unwrap();
        assert_eq!(reopened.track("one").unwrap().album, "Reviewed title");
    }
    #[test]
    fn cancellation_failures_and_changed_album_apply_nothing_and_keep_old_cover() {
        let (_dir, db, service, catalog) = setup();
        let preview = service.search("album").unwrap();
        service.discard(&preview.id);
        assert!(service.apply(&preview.id, edits()).is_err());
        assert_eq!(db.track("one").unwrap().album, "Old album");
        catalog.fail.store(true, Ordering::Release);
        assert!(service.search("album").is_err());
        catalog.fail.store(false, Ordering::Release);
        catalog.no_cover.store(true, Ordering::Release);
        let preview = service.search("album").unwrap();
        assert!(!preview.new_cover);
        assert!(preview.warning.is_some());
        db.connect()
            .unwrap()
            .execute(
                "UPDATE tracks SET album_id='another-album' WHERE id='two'",
                [],
            )
            .unwrap();
        assert!(service.apply(&preview.id, edits()).is_err());
        assert_eq!(db.track("one").unwrap().album, "Old album");
    }
    #[test]
    fn catalog_parser_and_artwork_hosts_reject_untrusted_identities_and_urls() {
        let data = serde_json::json!({"releases":[{"id":"../../bad","title":"Bad","artist-credit":[{"name":"Bad"}]},{"id":"76df3287-6cda-33eb-8e9a-044b5e15ffdd","title":"Album","date":"2025-09-01","score":100,"track-count":12,"artist-credit":[{"name":"Artist","joinphrase":" & "},{"name":"Guest"}]}]});
        let matches = parse_matches(data).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].artist, "Artist & Guest");
        assert_eq!(matches[0].year, Some(2025));
        for value in [
            "http://archive.org/a",
            "https://archive.org.evil.test/a",
            "https://127.0.0.1/a",
            "https://user@archive.org/a",
            "https://archive.org:444/a",
        ] {
            assert!(!cover_url(&url::Url::parse(value).unwrap()));
        }
        assert!(cover_url(
            &url::Url::parse("https://ia800001.us.archive.org/download/art.jpg").unwrap()
        ));
        assert_eq!(quoted("name\" AND artist:*"), "\"name\\\" AND artist:*\"");
    }
    #[test]
    #[ignore = "requires public MusicBrainz/Cover Art Archive network access; no OpenAI key used"]
    fn live_catalog_and_cover_contract() {
        let catalog = MusicBrainzCatalog::default();
        let matches = catalog
            .search(&AlbumHint {
                title: "Abbey Road".into(),
                artist: "The Beatles".into(),
                edition: "".into(),
                year: Some(1969),
            })
            .unwrap();
        assert!(!matches.is_empty());
        let mut found = false;
        for candidate in matches.iter().take(3) {
            if let Some(bytes) = catalog.cover(&candidate.id).unwrap() {
                assert!(image::load_from_memory(&bytes).is_ok());
                found = true;
                break;
            }
        }
        assert!(found, "Expected a public catalog cover");
        println!(
            "Public catalog identity/artwork contract passed; {} candidates.",
            matches.len()
        );
    }
    #[test]
    fn transient_catalog_failure_retries_only_the_catalog_and_honours_short_retry_after() {
        let mut statuses = std::collections::VecDeque::from([503, 200]);
        let mut calls = 0;
        let mut waits = vec![];
        let result = catalog_request(
            || {
                calls += 1;
                let status = statuses.pop_front().unwrap();
                Ok(CatalogReply {
                    status,
                    retry_after: Some(3),
                    deferred: false,
                    data: (status == 200).then(|| serde_json::json!({"releases":[]})),
                })
            },
            |d| waits.push(d),
        );
        assert!(
            result.is_ok(),
            "temporary catalog failure should recover: {}",
            result.err().unwrap_or_default()
        );
        assert_eq!(calls, 2);
        assert_eq!(waits, vec![Duration::from_secs(3)]);
    }
}
