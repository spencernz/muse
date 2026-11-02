use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub album_id: String,
    pub year: Option<i32>,
    pub genre: String,
    pub duration: f64,
    pub track_no: u32,
    pub disc_no: u32,
    pub cover: Option<String>,
    pub liked: bool,
    pub available: bool,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub genre: String,
    pub cover: Option<String>,
    pub duration: f64,
    pub tracks: usize,
    pub added_at: i64,
    pub last_played: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TrackQuery {
    pub search: String,
    pub album_id: Option<String>,
    pub artist: Option<String>,
    pub genre: Option<String>,
    pub playlist_id: Option<String>,
    pub favourites: bool,
    pub sort: String,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackPage {
    pub items: Vec<Track>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFolder {
    pub id: String,
    pub path: String,
    pub available: bool,
    pub last_scan: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub tracks: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Facet {
    pub name: String,
    pub tracks: usize,
    pub cover: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub tracks: usize,
    pub albums: Vec<Album>,
    pub artists: Vec<Facet>,
    pub genres: Vec<Facet>,
    pub sources: Vec<SourceFolder>,
    pub playlists: Vec<Playlist>,
    pub tiles: Vec<Tile>,
    pub issues: Vec<ScanIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanIssue {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tile {
    pub id: String,
    pub kind: String,
    pub size: String,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub running: bool,
    pub scanned: usize,
    pub changed: usize,
    pub errors: usize,
    pub current: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub current: Option<Track>,
    pub playing: bool,
    pub position: f64,
    pub volume: f32,
    pub shuffle: bool,
    pub repeat: String,
    pub queue: Vec<String>,
    pub index: usize,
    pub error: Option<String>,
    pub media_controls: bool,
}

impl Default for Playback {
    fn default() -> Self {
        Self {
            current: None,
            playing: false,
            position: 0.,
            volume: 0.8,
            shuffle: false,
            repeat: "off".into(),
            queue: vec![],
            index: 0,
            error: None,
            media_controls: false,
        }
    }
}

/// Remove deleted catalog identities while retaining an unrelated playing track.
/// Returns whether the current input must be stopped by the audio engine.
pub fn prune_playback(playback: &mut Playback, removed: &[String]) -> bool {
    let removed: std::collections::HashSet<_> = removed.iter().collect();
    let current_removed = playback
        .current
        .as_ref()
        .is_some_and(|t| removed.contains(&t.id));
    let before = playback
        .queue
        .iter()
        .take(playback.index)
        .filter(|id| removed.contains(id))
        .count();
    playback.queue.retain(|id| !removed.contains(id));
    playback.index = playback
        .index
        .saturating_sub(before)
        .min(playback.queue.len().saturating_sub(1));
    if current_removed || playback.queue.is_empty() {
        playback.current = None;
        playback.playing = false;
        playback.position = 0.;
    } else if let Some(current) = &playback.current {
        if let Some(index) = playback.queue.iter().position(|id| *id == current.id) {
            playback.index = index;
        }
    }
    current_removed
}
