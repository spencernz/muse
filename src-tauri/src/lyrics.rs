//! Read-only exact lyric lookup. Imported text is retained locally; online text is memory-only.
use crate::{db::Result, AppState};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub plain: Option<String>,
    pub synced: Option<String>,
    pub instrumental: bool,
    pub source: String,
}
type Cache = BTreeMap<String, (Instant, Option<Lyrics>)>;
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
fn normal(value: &str) -> String {
    value.trim().to_lowercase()
}
fn matched(value: &serde_json::Value, title: &str, artist: &str, duration: f64) -> bool {
    value["trackName"]
        .as_str()
        .is_some_and(|s| normal(s) == normal(title))
        && value["artistName"]
            .as_str()
            .is_some_and(|s| normal(s) == normal(artist))
        && value["duration"]
            .as_f64()
            .is_some_and(|n| (n - duration).abs() <= 2.)
}
#[tauri::command]
pub async fn track_lyrics(id: String, state: tauri::State<'_, AppState>) -> Result<Option<Lyrics>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let track = db
            .get_tracks(&[id.clone()])?
            .into_iter()
            .next()
            .ok_or("This track is no longer in your library.")?;
        if let Some(text) = db.setting::<String>(&format!("lyrics.import.{id}")) {
            return Ok(Some(Lyrics {
                plain: Some(text.clone()),
                synced: Some(text),
                instrumental: false,
                source: "Imported lyrics".into(),
            }));
        }
        if !track.duration.is_finite() || !(1. ..=3600.).contains(&track.duration) {
            return Ok(None);
        }
        let signature =
            serde_json::to_string(&(&track.title, &track.artist, &track.album, track.duration))
                .map_err(|_| "Cannot prepare lyrics lookup.")?;
        let cache = CACHE.get_or_init(|| Mutex::new(BTreeMap::new()));
        {
            let mut cache = cache.lock().map_err(|_| "Lyrics lookup is busy.")?;
            cache.retain(|_, (at, _)| at.elapsed() < Duration::from_secs(900));
            if let Some((_, lyrics)) = cache.get(&signature) {
                return Ok(lyrics.clone());
            }
        }
        let mut url =
            url::Url::parse("https://lrclib.net/api/get").map_err(|_| "Invalid lyrics address.")?;
        url.query_pairs_mut().extend_pairs([
            ("track_name", track.title.as_str()),
            ("artist_name", track.artist.as_str()),
            ("album_name", track.album.as_str()),
            ("duration", &track.duration.to_string()),
        ]);
        let response = crate::ai::client()?
            .get(url)
            .timeout(Duration::from_secs(12))
            .send()
            .map_err(|_| "Could not reach the lyrics service. Try again.")?;
        let result = match response.status().as_u16() {
            404 => None,
            200 => {
                let value: serde_json::Value =
                    serde_json::from_slice(&crate::ai::bytes(response, 256 * 1024)?)
                        .map_err(|_| "The lyrics service returned unreadable data.")?;
                if !matched(&value, &track.title, &track.artist, track.duration) {
                    None
                } else {
                    let text = |key: &str| {
                        value[key]
                            .as_str()
                            .filter(|s| !s.trim().is_empty())
                            .map(str::to_owned)
                    };
                    Some(Lyrics {
                        plain: text("plainLyrics"),
                        synced: text("syncedLyrics"),
                        instrumental: value["instrumental"].as_bool().unwrap_or(false),
                        source: "LRCLIB".into(),
                    })
                }
            }
            429 => return Err("LRCLIB is rate limited (HTTP 429). Try again later.".into()),
            code => {
                return Err(format!(
                    "LRCLIB is unavailable (HTTP {code}). Try again later."
                ))
            }
        };
        let mut cache = cache.lock().map_err(|_| "Lyrics lookup is busy.")?;
        if cache.len() >= 64 {
            cache.clear();
        }
        cache.insert(signature, (Instant::now(), result.clone()));
        Ok(result)
    })
    .await
    .map_err(|_| "Could not load lyrics.")?
}
#[tauri::command]
pub fn import_track_lyrics(
    id: String,
    text: String,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    if text.trim().is_empty() || text.len() > 128 * 1024 || text.contains('\0') {
        return Err("Choose a nonempty LRC or text file smaller than 128 KB.".into());
    }
    if state.db.get_tracks(&[id.clone()])?.is_empty() {
        return Err("This track is no longer in your library.".into());
    }
    state.db.set_setting(&format!("lyrics.import.{id}"), &text)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_wrong_recording() {
        let value =
            serde_json::json!({"trackName":"Synthetic song","artistName":"Artist","duration":180});
        assert!(matched(&value, "Synthetic song", "Artist", 181.));
        assert!(!matched(&value, "Synthetic song (Live)", "Artist", 180.));
        assert!(!matched(&value, "Synthetic song", "Other", 180.));
        assert!(!matched(&value, "Synthetic song", "Artist", 200.));
    }
}
