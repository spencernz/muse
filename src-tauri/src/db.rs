use crate::models::*;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use std::{
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, String>;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[derive(Clone)]
pub struct Db {
    pub path: PathBuf,
    pub artwork: PathBuf,
}

impl Db {
    pub fn new(root: &Path) -> Result<Self> {
        std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
        let db = Self {
            path: root.join("muse.sqlite3"),
            artwork: root.join("artwork"),
        };
        std::fs::create_dir_all(&db.artwork).map_err(|e| e.to_string())?;
        let mut conn = db.connect()?;
        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 3 {
            return Err(
                "This catalog was created by a newer Muse version. Please update Muse to open it."
                    .into(),
            );
        }
        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        crate::catalog::repair_remote_ids(&tx)?;
        crate::catalog::reapply_overrides(&tx, None)?;
        delete_orphaned_tracks(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(db)
    }
    pub fn connect(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path).map_err(|e| e.to_string())?;
        conn.busy_timeout(Duration::from_secs(10))
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;
        Ok(conn)
    }
    pub fn setting<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let conn = self.connect().ok()?;
        let value: String = conn
            .query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
                r.get(0)
            })
            .ok()?;
        serde_json::from_str(&value).ok()
    }
    pub fn set_setting<T: serde::Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        self.connect()?.execute("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,json]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn sources(&self) -> Result<Vec<SourceFolder>> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT id,path,available,last_scan,error FROM sources ORDER BY path")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(SourceFolder {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    available: r.get(2)?,
                    last_scan: r.get(3)?,
                    error: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn add_sources(&self, folders: Vec<String>) -> Result<()> {
        if folders.len() > 32 {
            return Err("Choose at most 32 folders at once.".into());
        }
        let conn = self.connect()?;
        for folder in folders {
            let path = std::fs::canonicalize(folder).map_err(|e| e.to_string())?;
            if !path.is_dir() {
                return Err("Choose a music folder.".into());
            }
            let source_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT OR IGNORE INTO sources(id,path) VALUES (?,?)",
                params![source_id, path.to_string_lossy()],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn remove_source(&self, id: &str) -> Result<Vec<String>> {
        let mut conn = self.connect()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM sources WHERE id=?", [id])
            .map_err(|e| e.to_string())?;
        let removed = delete_orphaned_tracks(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(removed)
    }
    pub fn tracks(&self, q: &TrackQuery) -> Result<TrackPage> {
        let conn = self.connect()?;
        let (filter, mut args) = query_filter(q);
        let total = conn
            .query_row(
                &format!("SELECT count(*) FROM tracks t WHERE {filter}"),
                params_from_iter(&args),
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if q.playlist_id.is_some() && q.sort.is_empty() {
            args.push(q.playlist_id.clone().unwrap());
        }
        let sql = format!(
            "SELECT {TRACK_COLUMNS} FROM tracks t WHERE {filter} ORDER BY {} LIMIT {} OFFSET {}",
            sort(q),
            q.limit.clamp(1, 500),
            q.offset
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let items = stmt
            .query_map(params_from_iter(args), read_track)
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(TrackPage { items, total })
    }
    pub fn track_ids(&self, q: &TrackQuery) -> Result<Vec<String>> {
        let conn = self.connect()?;
        let (filter, mut args) = query_filter(q);
        if q.playlist_id.is_some() && q.sort.is_empty() {
            args.push(q.playlist_id.clone().unwrap());
        }
        let mut stmt = conn
            .prepare(&format!(
                "SELECT t.id FROM tracks t WHERE {filter} ORDER BY {} LIMIT 100000",
                sort(q)
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_from_iter(args), |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn track(&self, id: &str) -> Result<Track> {
        self.connect()?
            .query_row(
                &format!("SELECT {TRACK_COLUMNS} FROM tracks t WHERE t.id=?"),
                [id],
                read_track,
            )
            .map_err(|_| "This track is no longer in the catalog.".into())
    }
    pub fn file_for(&self, id: &str) -> Result<PathBuf> {
        let conn = self.connect()?;
        let mut stmt=conn.prepare("SELECT l.path FROM locations l JOIN sources s ON s.id=l.source_id WHERE l.track_id=? AND l.present=1 AND s.available=1 ORDER BY l.path").map_err(|e|e.to_string())?;
        let paths = stmt
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for path in paths.flatten() {
            if Path::new(&path).is_file() {
                return Ok(path.into());
            }
        }
        Err("Audio file unavailable. Reconnect its drive or rescan the folder.".into())
    }
    pub fn get_tracks(&self, ids: &[String]) -> Result<Vec<Track>> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {TRACK_COLUMNS} FROM tracks t WHERE t.id=?"
            ))
            .map_err(|e| e.to_string())?;
        let mut result = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(track) = stmt
                .query_row([id], read_track)
                .optional()
                .map_err(|e| e.to_string())?
            {
                result.push(track);
            }
        }
        Ok(result)
    }
    pub fn favourites(&self, ids: Vec<String>, liked: bool) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for id in ids {
            tx.execute("UPDATE tracks SET liked=? WHERE id=?", params![liked, id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn favourite(&self, id: &str, liked: bool) -> Result<()> {
        self.connect()?
            .execute("UPDATE tracks SET liked=? WHERE id=?", params![liked, id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn played(&self, id: &str) {
        if let Ok(conn) = self.connect() {
            let _ = conn.execute(
                "INSERT INTO history(track_id,played_at) VALUES (?,?)",
                params![id, now()],
            );
            let _ = conn.execute(
                "UPDATE tracks SET last_played=? WHERE id=?",
                params![now(), id],
            );
        }
    }
    pub fn playlist(
        &self,
        action: &str,
        id: Option<&str>,
        name: Option<&str>,
        track_ids: Vec<String>,
    ) -> Result<Option<String>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut created = None;
        match action {
            "create" => {
                let name = name.unwrap_or("").trim();
                if name.is_empty() || name.chars().count() > 120 {
                    return Err("Enter a playlist name (up to 120 characters).".into());
                }
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO playlists(id,name) VALUES (?,?)",
                    params![id, name],
                )
                .map_err(|e| e.to_string())?;
                created = Some(id);
            }
            "rename" => {
                let name = name.unwrap_or("").trim();
                if name.is_empty() || name.chars().count() > 120 {
                    return Err("Enter a playlist name (up to 120 characters).".into());
                }
                tx.execute("UPDATE playlists SET name=? WHERE id=?", params![name, id])
                    .map_err(|e| e.to_string())?;
            }
            "delete" => {
                tx.execute("DELETE FROM playlists WHERE id=?", [id])
                    .map_err(|e| e.to_string())?;
            }
            "add" => {
                let position:i64=tx.query_row("SELECT coalesce(max(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
                for (offset, track) in track_ids.into_iter().enumerate() {
                    tx.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES (?,?,?)",params![id,track,position+offset as i64]).map_err(|e|e.to_string())?;
                }
            }
            "remove" => {
                for track in track_ids {
                    tx.execute(
                        "DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?",
                        params![id, track],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            _ => return Err("Unknown playlist action.".into()),
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(created)
    }
    pub fn library(&self) -> Result<Library> {
        let conn = self.connect()?;
        let tracks = conn
            .query_row("SELECT count(*) FROM tracks", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut stmt=conn.prepare("SELECT album_id,album,album_artist,max(year),max(genre),max(cover),sum(duration),count(*),max(added_at),max(last_played) FROM tracks GROUP BY album_id ORDER BY album_artist COLLATE NOCASE,album COLLATE NOCASE").map_err(|e|e.to_string())?;
        let albums = stmt
            .query_map([], |r| {
                Ok(Album {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    artist: r.get(2)?,
                    year: r.get(3)?,
                    genre: r.get(4)?,
                    cover: r.get(5)?,
                    duration: r.get(6)?,
                    tracks: r.get(7)?,
                    added_at: r.get(8)?,
                    last_played: r.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let mut stmt=conn.prepare("SELECT p.id,p.name,count(pt.track_id) FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id GROUP BY p.id ORDER BY p.name COLLATE NOCASE").map_err(|e|e.to_string())?;
        let playlists = stmt
            .query_map([], |r| {
                Ok(Playlist {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    tracks: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let facets = |column: &str| -> Result<Vec<Facet>> {
            let mut stmt=conn.prepare(&format!("SELECT {column},count(*),max(cover) FROM tracks WHERE {column}<>'' GROUP BY {column} ORDER BY {column} COLLATE NOCASE")).map_err(|e|e.to_string())?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(Facet {
                        name: r.get(0)?,
                        tracks: r.get(1)?,
                        cover: r.get(2)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<std::result::Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())
        };
        let default_tiles = vec![
            ("recent", "medium"),
            ("favourites", "small"),
            ("album", "small"),
            ("shuffle", "small"),
            ("playlists", "small"),
            ("album", "small"),
            ("added", "small"),
            ("collection", "wide"),
        ]
        .into_iter()
        .enumerate()
        .map(|(i, (kind, size))| Tile {
            id: format!("default-{i}"),
            kind: kind.into(),
            size: size.into(),
            target: None,
        })
        .collect();
        let mut issue_stmt = conn
            .prepare("SELECT path,error FROM scan_issues ORDER BY path LIMIT 100")
            .map_err(|e| e.to_string())?;
        let issues = issue_stmt
            .query_map([], |r| {
                Ok(ScanIssue {
                    path: r.get(0)?,
                    error: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(Library {
            tracks,
            albums,
            artists: facets("artist")?,
            genres: facets("genre")?,
            sources: self.sources()?,
            playlists,
            tiles: self.setting("tiles").unwrap_or(default_tiles),
            issues,
        })
    }
}

pub(crate) const TRACK_COLUMNS:&str="t.id,t.title,t.artist,t.album,t.album_artist,t.album_id,t.year,t.genre,t.duration,t.track_no,t.disc_no,t.cover,t.liked,EXISTS(SELECT 1 FROM locations l JOIN sources s ON s.id=l.source_id WHERE l.track_id=t.id AND l.present=1 AND s.available=1) OR EXISTS(SELECT 1 FROM remote_locations r JOIN remote_sources rs ON rs.id=r.source_id JOIN settings p ON p.key='providers.sftp.profile' AND json_remove(CASE WHEN json_valid(p.value) THEN p.value END,'$.identityFile')=json_remove(CASE WHEN json_valid(rs.profile) THEN rs.profile END,'$.identityFile') WHERE r.track_id=t.id AND r.present=1),t.added_at";
pub(crate) fn read_track(r: &Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: r.get(0)?,
        title: r.get(1)?,
        artist: r.get(2)?,
        album: r.get(3)?,
        album_artist: r.get(4)?,
        album_id: r.get(5)?,
        year: r.get(6)?,
        genre: r.get(7)?,
        duration: r.get(8)?,
        track_no: r.get(9)?,
        disc_no: r.get(10)?,
        cover: r.get(11)?,
        liked: r.get(12)?,
        available: r.get(13)?,
        added_at: r.get(14)?,
    })
}
fn query_filter(q: &TrackQuery) -> (String, Vec<String>) {
    let mut filters = vec!["1=1".to_string()];
    let mut args = vec![];
    if !q.search.trim().is_empty() {
        let words = q
            .search
            .split_whitespace()
            .take(20)
            .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        filters
            .push("t.rowid IN (SELECT rowid FROM track_search WHERE track_search MATCH ?)".into());
        args.push(words);
    }
    for (column, value) in [("t.album_id", &q.album_id), ("t.genre", &q.genre)] {
        if let Some(value) = value {
            filters.push(format!("{column}=?"));
            args.push(value.clone());
        }
    }
    if q.favourites {
        filters.push("t.liked=1".into());
    }
    if let Some(artist) = &q.artist {
        filters.push("(t.artist=? OR t.album_artist=?)".into());
        args.extend([artist.clone(), artist.clone()]);
    }
    if let Some(id) = &q.playlist_id {
        filters.push(
            "EXISTS(SELECT 1 FROM playlist_tracks pt WHERE pt.track_id=t.id AND pt.playlist_id=?)"
                .into(),
        );
        args.push(id.clone());
    }
    (filters.join(" AND "), args)
}
fn sort(q: &TrackQuery) -> &'static str {
    if q.playlist_id.is_some() && q.sort.is_empty() {
        return "(SELECT position FROM playlist_tracks WHERE playlist_id=? AND track_id=t.id),t.title";
    }
    match q.sort.as_str(){"artist"=>"t.artist COLLATE NOCASE,t.album COLLATE NOCASE,t.disc_no,t.track_no,t.title COLLATE NOCASE","added"=>"t.added_at DESC,t.rowid DESC","year"=>"t.year DESC,t.album COLLATE NOCASE,t.disc_no,t.track_no","album"=>"t.disc_no,t.track_no,t.title COLLATE NOCASE",_=>"t.title COLLATE NOCASE,t.id"}
}

pub fn lookup_id(conn: &Connection, path: &str, hash: &str) -> Result<Option<String>> {
    conn.query_row("SELECT track_id FROM locations WHERE path=? UNION ALL SELECT track_id FROM locations WHERE hash=? LIMIT 1",params![path,hash],|r|r.get(0)).optional().map_err(|e|e.to_string())
}

/// Physical audio and records backed by another source are never deleted here.
fn delete_orphaned_tracks(conn: &Connection) -> Result<Vec<String>> {
    const ORPHANS:&str="SELECT t.id FROM tracks t WHERE NOT EXISTS(SELECT 1 FROM locations l WHERE l.track_id=t.id) AND NOT EXISTS(SELECT 1 FROM remote_locations r WHERE r.track_id=t.id)";
    let removed: Vec<String> = conn
        .prepare(ORPHANS)
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<std::result::Result<_, _>>()
        .map_err(|e| e.to_string())?;
    if removed.is_empty() {
        return Ok(removed);
    }
    for table in ["history", "playlist_tracks"] {
        conn.execute(
            &format!("DELETE FROM {table} WHERE track_id IN ({ORPHANS})"),
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(&format!("DELETE FROM tracks WHERE id IN ({ORPHANS})"), [])
        .map_err(|e| e.to_string())?;
    let setting = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
            r.get(0)
        })
        .optional()
        .ok()
        .flatten()
    };
    if let Some(json) = setting("playback") {
        if let Ok(mut playback) = serde_json::from_str::<Playback>(&json) {
            let stopped = crate::models::prune_playback(&mut playback, &removed);
            if stopped {
                playback.current = playback.queue.get(playback.index).and_then(|id| {
                    conn.query_row(
                        &format!("SELECT {TRACK_COLUMNS} FROM tracks t WHERE t.id=?"),
                        [id],
                        read_track,
                    )
                    .ok()
                });
            }
            let value = serde_json::to_string(&playback).map_err(|e| e.to_string())?;
            conn.execute("UPDATE settings SET value=? WHERE key='playback'", [value])
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(json) = setting("tiles") {
        if let Ok(mut tiles) = serde_json::from_str::<Vec<Tile>>(&json) {
            tiles.retain(|tile| {
                tile.kind != "album"
                    || tile.target.as_ref().is_none_or(|id| {
                        conn.query_row(
                            "SELECT EXISTS(SELECT 1 FROM tracks WHERE album_id=?)",
                            [id],
                            |r| r.get::<_, bool>(0),
                        )
                        .unwrap_or(true)
                    })
            });
            conn.execute(
                "UPDATE settings SET value=? WHERE key='tiles'",
                [serde_json::to_string(&tiles).map_err(|e| e.to_string())?],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(removed)
}
