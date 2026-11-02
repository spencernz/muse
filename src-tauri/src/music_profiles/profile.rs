use crate::{
    db::{Db, Result},
    models::Track,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
pub const VERSION: &str = "musicnn-profiles-1";
pub const MOODS: &[&str] = &[
    "Happy",
    "Chill",
    "Dance",
    "Focus",
    "Energy",
    "Late night",
    "Melancholy",
    "Feel good",
];
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub relaxed: f64,
    pub happy: f64,
    pub sad: f64,
    pub aggressive: f64,
    pub danceable: f64,
    pub instrumental: f64,
    pub energy: f64,
    pub confidence: f64,
    pub tempo: Option<f64>,
    pub sample_seconds: f64,
    pub model_version: String,
}
impl Profile {
    pub fn validate(&self) -> bool {
        [
            self.relaxed,
            self.happy,
            self.sad,
            self.aggressive,
            self.danceable,
            self.instrumental,
            self.energy,
            self.confidence,
        ]
        .iter()
        .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
            && self
                .tempo
                .is_none_or(|v| v.is_finite() && (30.0..=300.0).contains(&v))
            && self.sample_seconds.is_finite()
            && (6.0..=60.0).contains(&self.sample_seconds)
            && self.model_version == VERSION
    }
}
pub fn fingerprint(db: &Db, track: &Track) -> Result<String> {
    if !track.available {
        return Err("Track source unavailable.".into());
    }
    let raw = if track.id.starts_with("sftp:") {
        let selected = crate::providers::remote::Selection::saved(db)?;
        let conn = db.connect()?;
        let (size, modified): (u64, u64) = conn
            .query_row(
                "SELECT size,modified FROM remote_locations WHERE track_id=? AND present=1",
                [&track.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Sync the remote catalog before analysing music.")?;
        if modified == 0 {
            return Err("Remote timestamps unavailable. Sync again before analysis.".into());
        }
        format!(
            "remote:{}:{}:{size}:{modified}",
            track.id,
            selected.cache_identity()
        )
    } else {
        let path = db.file_for(&track.id)?;
        let meta = std::fs::metadata(path).map_err(|_| "Track file unavailable.")?;
        let time = meta
            .modified()
            .map_err(|_| "Cannot read track timestamp.")?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Invalid track timestamp.")?;
        format!("local:{}:{}:{}", track.id, meta.len(), time.as_nanos())
    };
    Ok(blake3::hash(format!("{VERSION}:{raw}").as_bytes())
        .to_hex()
        .to_string())
}
pub fn cached(db: &Db, track: &Track) -> Result<Option<Profile>> {
    let stamp = fingerprint(db, track)?;
    let value:Option<String>=db.connect()?.query_row("SELECT profile FROM music_profiles WHERE track_id=? AND fingerprint=? AND model_version=?",params![track.id,stamp,VERSION],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    Ok(value
        .and_then(|v| serde_json::from_str::<Profile>(&v).ok())
        .filter(Profile::validate))
}
pub fn save(db: &Db, id: &str, stamp: &str, value: &Profile) -> Result<()> {
    if !value.validate() {
        return Err("Local analyser returned invalid scores.".into());
    }
    let track = db.track(id)?;
    if fingerprint(db, &track)? != stamp {
        return Err("Track changed during analysis. Sync and retry.".into());
    }
    db.connect()?.execute("INSERT INTO music_profiles(track_id,fingerprint,model_version,profile,analysed_at) VALUES (?,?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET fingerprint=excluded.fingerprint,model_version=excluded.model_version,profile=excluded.profile,analysed_at=excluded.analysed_at",params![id,stamp,VERSION,serde_json::to_string(value).map_err(|_|"Cannot encode track profile.")?,crate::db::now()]).map_err(|_|"Cannot save track profile.")?;
    Ok(())
}
/// Thresholds are explicit: uncertain or incompatible tracks do not fill a quota.
pub fn mood_score(p: &Profile, mood: &str) -> Option<f64> {
    if !p.validate() || p.confidence < 0.2 {
        return None;
    }
    let (eligible, score) = match mood {
        "Chill" => (
            p.relaxed >= 0.55 && p.energy <= 0.5 && p.aggressive <= 0.25,
            p.relaxed * 0.7 + (1. - p.energy) * 0.3,
        ),
        "Late night" => (
            p.energy <= 0.55 && p.aggressive <= 0.3 && p.relaxed >= 0.45,
            p.relaxed * 0.55 + (1. - p.energy) * 0.45,
        ),
        "Focus" => (
            p.instrumental >= 0.65 && p.aggressive <= 0.3 && p.energy <= 0.65,
            p.instrumental * 0.65 + p.relaxed * 0.35,
        ),
        "Dance" => (
            p.danceable >= 0.65 && p.energy >= 0.45,
            p.danceable * 0.7 + p.energy * 0.3,
        ),
        "Energy" => (p.energy >= 0.65, p.energy * 0.7 + p.danceable * 0.3),
        "Melancholy" => (
            p.sad >= 0.6 && p.aggressive <= 0.4,
            p.sad * 0.75 + (1. - p.energy) * 0.25,
        ),
        "Happy" | "Feel good" => (
            p.happy >= 0.6 && p.sad <= 0.4,
            p.happy * 0.8 + p.danceable * 0.2,
        ),
        _ => return None,
    };
    eligible.then_some(score)
}
