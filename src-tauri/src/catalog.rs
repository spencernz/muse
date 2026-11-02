//! Stable file identities and locally reviewed metadata, independent of source tag refreshes.
use crate::{
    db::{read_track, Result, TRACK_COLUMNS},
    models::{Playback, Tile},
    providers::sftp::{absolute_path, relative_path, Config},
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::BTreeMap;
pub fn endpoint(config: &Config) -> String {
    blake3::hash(format!("{}\0{}\0{}", config.host, config.port, config.username).as_bytes())
        .to_hex()
        .to_string()
}
pub fn remote_path(config: &Config, relative: &str) -> Result<String> {
    let relative = relative_path(relative).map_err(|e| e.message)?;
    absolute_path(&format!("{}/{relative}", config.root.trim_end_matches('/')))
        .map_err(|e| e.message.to_string())
}
pub fn remote_identity(
    conn: &Connection,
    config: &Config,
    relative: &str,
) -> Result<Option<String>> {
    conn.query_row(
        "SELECT track_id FROM remote_file_ids WHERE endpoint=? AND path=?",
        params![endpoint(config), remote_path(config, relative)?],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}
pub fn album_id(config: &Config, metadata_hash: &str) -> String {
    format!("sftp:{}:album:{metadata_hash}", endpoint(config))
}

/// Seed old catalogs and merge only aliases of the exact same endpoint/account/path.
/// Identical titles at different paths are intentionally not evidence of duplicate audio.
pub fn repair_remote_ids(conn: &Connection) -> Result<()> {
    let rows:Vec<(String,String,String,String)>=conn.prepare("SELECT r.track_id,r.relative,s.profile,t.album_id FROM remote_locations r JOIN remote_sources s ON s.id=r.source_id JOIN tracks t ON t.id=r.track_id ORDER BY (s.profile=(SELECT value FROM settings WHERE key='providers.sftp.profile')) DESC,t.liked DESC,t.added_at,r.track_id").map_err(|e|e.to_string())?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|e|e.to_string())?.collect::<std::result::Result<_,_>>().map_err(|e|e.to_string())?;
    let mut tracks = BTreeMap::new();
    let mut albums = BTreeMap::new();
    for (id, relative, profile, old_album) in rows {
        let Ok(config) = serde_json::from_str::<Config>(&profile).and_then(|c| {
            c.validate()
                .map_err(|e| <serde_json::Error as serde::de::Error>::custom(e.message))
        }) else {
            continue;
        };
        let path = remote_path(&config, &relative)?;
        let ep = endpoint(&config);
        if let Some(hash) = old_album
            .split(":album:")
            .nth(1)
            .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            let canonical = album_id(&config, hash);
            let overridden: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM track_album_overrides WHERE track_id=?)",
                    [&id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !overridden && canonical != old_album {
                conn.execute(
                    "UPDATE tracks SET album_id=? WHERE id=?",
                    params![canonical, id],
                )
                .map_err(|e| e.to_string())?;
                albums.insert(old_album, canonical);
            }
        }
        if let Some(canonical) = conn
            .query_row(
                "SELECT track_id FROM remote_file_ids WHERE endpoint=? AND path=?",
                params![ep, path],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            if canonical != id {
                merge_track(conn, &id, &canonical)?;
                tracks.insert(id, canonical);
            }
        } else {
            conn.execute(
                "INSERT INTO remote_file_ids(endpoint,path,track_id) VALUES (?,?,?)",
                params![ep, path, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if !tracks.is_empty() || !albums.is_empty() {
        repair_saved(conn, &tracks, &albums)?;
    }
    Ok(())
}
fn merge_track(conn: &Connection, old: &str, canonical: &str) -> Result<()> {
    conn.execute("UPDATE tracks SET liked=max(liked,(SELECT liked FROM tracks WHERE id=?)),added_at=min(added_at,(SELECT added_at FROM tracks WHERE id=?)),last_played=max(last_played,(SELECT last_played FROM tracks WHERE id=?)) WHERE id=?",params![old,old,old,canonical]).map_err(|e|e.to_string())?;
    conn.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) SELECT playlist_id,?,position FROM playlist_tracks WHERE track_id=?",params![canonical,old]).map_err(|e|e.to_string())?;
    conn.execute("DELETE FROM playlist_tracks WHERE track_id=?", [old])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE history SET track_id=? WHERE track_id=?",
        params![canonical, old],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE locations SET track_id=? WHERE track_id=?",
        params![canonical, old],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("INSERT OR IGNORE INTO track_album_overrides(track_id,album_id) SELECT ?,album_id FROM track_album_overrides WHERE track_id=?",params![canonical,old]).map_err(|e|e.to_string())?;
    // Preserve the location selected by the current SSH profile when old aliases are merged.
    let location:Option<(String,String,u64,u64,bool)>=conn.query_row("SELECT r.source_id,r.relative,r.size,r.modified,r.present FROM remote_locations r JOIN remote_sources s ON s.id=r.source_id WHERE r.track_id=? AND s.profile=(SELECT value FROM settings WHERE key='providers.sftp.profile')",[old],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional().map_err(|e|e.to_string())?;
    conn.execute("DELETE FROM remote_locations WHERE track_id=?", [old])
        .map_err(|e| e.to_string())?;
    if let Some((source, relative, size, modified, present)) = location {
        conn.execute("INSERT INTO remote_locations(track_id,source_id,relative,size,modified,present) VALUES (?,?,?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET source_id=excluded.source_id,relative=excluded.relative,size=excluded.size,modified=excluded.modified,present=excluded.present",params![canonical,source,relative,size,modified,present]).map_err(|e|e.to_string())?;
    }
    conn.execute("DELETE FROM tracks WHERE id=?", [old])
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn repair_saved(
    conn: &Connection,
    tracks: &BTreeMap<String, String>,
    albums: &BTreeMap<String, String>,
) -> Result<()> {
    let read = |key: &str| {
        conn.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .ok()
        .flatten()
    };
    if let Some(mut p) = read("playback").and_then(|v| serde_json::from_str::<Playback>(&v).ok()) {
        for id in &mut p.queue {
            if let Some(new) = tracks.get(id) {
                *id = new.clone();
            }
        }
        if let Some(current) = &p.current {
            let id = tracks.get(&current.id).unwrap_or(&current.id);
            p.current = conn
                .query_row(
                    &format!("SELECT {TRACK_COLUMNS} FROM tracks t WHERE t.id=?"),
                    [id],
                    read_track,
                )
                .optional()
                .map_err(|e| e.to_string())?;
        }
        conn.execute(
            "UPDATE settings SET value=? WHERE key='playback'",
            [serde_json::to_string(&p).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(mut tiles) = read("tiles").and_then(|v| serde_json::from_str::<Vec<Tile>>(&v).ok())
    {
        for tile in &mut tiles {
            if tile.kind == "album" {
                if let Some(new) = tile.target.as_ref().and_then(|id| albums.get(id)) {
                    tile.target = Some(new.clone());
                }
            }
        }
        conn.execute(
            "UPDATE settings SET value=? WHERE key='tiles'",
            [serde_json::to_string(&tiles).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn reapply_overrides(conn: &Connection, track: Option<&str>) -> Result<()> {
    let filter = if track.is_some() { " AND t.id=?" } else { "" };
    let values: Vec<&str> = track.into_iter().collect();
    conn.execute(&format!("INSERT OR IGNORE INTO track_album_overrides(track_id,album_id) SELECT t.id,t.album_id FROM tracks t JOIN album_overrides o ON o.id=t.album_id WHERE 1=1{filter}"),rusqlite::params_from_iter(&values)).map_err(|e|e.to_string())?;
    let filter = if track.is_some() {
        " AND tracks.id=?"
    } else {
        ""
    };
    conn.execute(&format!("UPDATE tracks SET album_id=(SELECT o.id FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id),album=(SELECT o.title FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id),album_artist=(SELECT o.artist FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id),year=(SELECT o.year FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id),genre=(SELECT o.genre FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id),cover=(SELECT o.cover FROM track_album_overrides b JOIN album_overrides o ON o.id=b.album_id WHERE b.track_id=tracks.id) WHERE EXISTS(SELECT 1 FROM track_album_overrides b WHERE b.track_id=tracks.id){filter}"),rusqlite::params_from_iter(values)).map_err(|e|e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    #[test]
    fn legacy_overlapping_file_aliases_merge_preferences_history_and_saved_queue() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::new(dir.path()).unwrap();
        let wide = Config {
            host: "music.example.test".into(),
            port: 2222,
            username: "listener".into(),
            root: "/music".into(),
            identity_file: None,
        };
        let mut narrow = wide.clone();
        narrow.root = "/music/Artist".into();
        db.set_setting("providers.sftp.profile", &Some(&narrow))
            .unwrap();
        let conn = db.connect().unwrap();
        let hash = "a".repeat(64);
        for (id, config, relative, liked) in [
            ("wide", wide.clone(), "Artist/a.mp3", false),
            ("narrow", narrow.clone(), "a.mp3", true),
        ] {
            conn.execute(
                "INSERT INTO remote_sources(id,profile) VALUES (?,?)",
                params![id, serde_json::to_string(&config).unwrap()],
            )
            .unwrap();
            conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,genre,duration,track_no,disc_no,liked,added_at) VALUES (?,'Song','Artist','Album','Artist',?,'Pop',180,1,1,?,1)",params![id,format!("sftp:{id}:album:{hash}"),liked]).unwrap();
            conn.execute("INSERT INTO remote_locations(track_id,source_id,relative,size,modified) VALUES (?,?,?,100,1)",params![id,id,relative]).unwrap();
            db.played(id);
        }
        let list = db
            .playlist("create", None, Some("Both copies"), vec![])
            .unwrap()
            .unwrap();
        db.playlist(
            "add",
            Some(&list),
            None,
            vec!["wide".into(), "narrow".into()],
        )
        .unwrap();
        db.set_setting(
            "playback",
            &Playback {
                queue: vec!["wide".into(), "narrow".into()],
                current: Some(db.track("wide").unwrap()),
                position: 30.,
                ..Default::default()
            },
        )
        .unwrap();
        drop(conn);
        let migrated = Db::new(dir.path()).unwrap();
        assert_eq!(migrated.library().unwrap().tracks, 1);
        let id = migrated
            .track_ids(&crate::models::TrackQuery::default())
            .unwrap()
            .remove(0);
        assert!(migrated.track(&id).unwrap().liked);
        assert!(migrated.track(&id).unwrap().available);
        assert_eq!(migrated.library().unwrap().playlists[0].tracks, 1);
        let history: i64 = migrated
            .connect()
            .unwrap()
            .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(history, 2);
        let saved: Playback = migrated.setting("playback").unwrap();
        assert_eq!(saved.queue, vec![id.clone(), id.clone()]);
        assert_eq!(saved.current.unwrap().id, id);
        assert_eq!(saved.position, 30.);
        assert_eq!(migrated.library().unwrap().albums.len(), 1);
    }
}
