//! Read-only remote catalog. Audio is never copied into the local music library.
use super::sftp::{Config, Connector, EntryKind, HostKey, ReadSeek, RemoteFile, RemoteSession};
use crate::{
    db::{now, Db, Result},
    metadata::{self, Metadata},
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[derive(Clone, PartialEq, Eq)]
pub struct Selection {
    pub config: Config,
    key: HostKey,
}
fn setting<T: serde::de::DeserializeOwned>(db: &Db, key: &str) -> Result<Option<T>> {
    let value: Option<String> = db
        .connect()?
        .query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| "Cannot read SSH settings.")?;
    value
        .map(|v| serde_json::from_str(&v).map_err(|_| "Cannot read SSH settings.".into()))
        .transpose()
}
impl Selection {
    pub fn saved(db: &Db) -> Result<Self> {
        let config = setting::<Option<Config>>(db, "providers.sftp.profile")?
            .flatten()
            .ok_or("Connect to SSH and select a music folder first.")?
            .validate()
            .map_err(|e| e.message)?;
        let hosts: BTreeMap<String, HostKey> =
            setting(db, "providers.sftp.trusted_hosts")?.unwrap_or_default();
        let key = hosts
            .get(&config.endpoint())
            .cloned()
            .ok_or("Verify the SSH server key before syncing or playing music.")?;
        Ok(Self { config, key })
    }
    pub fn id(&self) -> String {
        format!(
            "sftp:{}",
            blake3::hash(
                format!(
                    "{}\0{}\0{}\0{}",
                    self.config.host, self.config.port, self.config.username, self.config.root
                )
                .as_bytes()
            )
            .to_hex()
        )
    }
    pub fn cache_identity(&self) -> String {
        blake3::hash(format!("{}:{}", self.config.endpoint(), self.key.fingerprint).as_bytes())
            .to_hex()
            .to_string()
    }
    pub fn current(&self, db: &Db) -> bool {
        Self::saved(db).is_ok_and(|s| s == *self)
    }
    pub fn connect(&self, connector: &dyn Connector) -> Result<Box<dyn RemoteSession>> {
        let mut session = connector.handshake(&self.config).map_err(|e| e.message)?;
        if session.host_key().map_err(|e| e.message)? != self.key {
            return Err(
                "The server key changed. Verify it with the server owner in SSH settings.".into(),
            );
        }
        session.authenticate(&self.config).map_err(|e| e.message)?;
        let root = session
            .canonical_directory(&self.config.root)
            .map_err(|e| e.message)?;
        if root != self.config.root {
            return Err("The remote folder moved. Select it again in SSH settings.".into());
        }
        Ok(session)
    }
}
pub struct CheckedReader {
    inner: Box<dyn ReadSeek>,
    remaining: u64,
    pub failed: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
}
impl CheckedReader {
    pub fn new(file: RemoteFile, limit: u64, cancel: Arc<AtomicBool>) -> Self {
        Self {
            inner: file.reader,
            remaining: limit,
            failed: Arc::new(AtomicBool::new(false)),
            cancel,
        }
    }
}
impl Read for CheckedReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.cancel.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "Remote read cancelled.",
            ));
        }
        if buf.is_empty() {
            return Ok(0);
        }
        if self.remaining == 0 {
            return Err(io::Error::other("Remote metadata read limit reached."));
        }
        let len = buf
            .len()
            .min(self.remaining.min(usize::MAX as u64) as usize);
        match self.inner.read(&mut buf[..len]) {
            Ok(n) => {
                self.remaining -= n as u64;
                Ok(n)
            }
            Err(_) => {
                self.failed.store(true, Ordering::Release);
                Err(io::Error::other(
                    "Remote audio connection interrupted. Reconnect and retry.",
                ))
            }
        }
    }
}
impl Seek for CheckedReader {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        if self.cancel.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "Remote read cancelled.",
            ));
        }
        self.inner
            .seek(pos)
            .inspect_err(|_| self.failed.store(true, Ordering::Release))
    }
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub running: bool,
    pub scanned: usize,
    pub indexed: usize,
    pub skipped: usize,
    pub unchanged: usize,
    pub message: String,
    pub error: Option<String>,
    pub completed_at: Option<i64>,
    pub source_id: Option<String>,
}
const AUTO_SETTING: &str = "providers.sftp.auto_sync";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSync {
    pub enabled: bool,
    pub interval_minutes: u64,
}
impl Default for AutoSync {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_minutes: 15,
        }
    }
}
fn schedule_due(preferences: &AutoSync, running: bool, elapsed: u64) -> bool {
    preferences.enabled && !running && elapsed >= preferences.interval_minutes * 60
}
#[derive(Clone)]
pub struct RemoteCatalog {
    db: Db,
    connector: Arc<dyn Connector>,
    status: Arc<Mutex<SyncStatus>>,
    cancel: Arc<AtomicBool>,
    app: Option<tauri::AppHandle>,
    last_attempt: Arc<Mutex<Option<(String, std::time::Instant)>>>,
}
impl RemoteCatalog {
    pub fn new(db: Db, connector: Arc<dyn Connector>) -> Self {
        Self {
            db,
            connector,
            status: Arc::new(Mutex::new(SyncStatus::default())),
            cancel: Arc::new(AtomicBool::new(false)),
            app: None,
            last_attempt: Arc::new(Mutex::new(None)),
        }
    }
    pub fn with_app(mut self, app: tauri::AppHandle) -> Self {
        self.app = Some(app);
        let worker = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(15));
            worker.automatic_tick();
        });
        self
    }
    pub fn auto_settings(&self) -> Result<AutoSync> {
        let value = setting::<AutoSync>(&self.db, AUTO_SETTING)?.unwrap_or_default();
        if ![5, 15, 30, 60].contains(&value.interval_minutes) {
            return Err("Choose a supported sync interval.".into());
        }
        Ok(value)
    }
    pub fn save_auto_settings(&self, value: AutoSync) -> Result<AutoSync> {
        if ![5, 15, 30, 60].contains(&value.interval_minutes) {
            return Err("Choose a supported sync interval.".into());
        }
        self.db.set_setting(AUTO_SETTING, &value)?;
        Ok(value)
    }
    fn automatic_tick(&self) {
        let Ok(preferences) = self.auto_settings() else {
            return;
        };
        if !preferences.enabled {
            return;
        }
        let Ok(selected) = Selection::saved(&self.db) else {
            return;
        };
        let status = self.status();
        let elapsed = {
            let attempt = self.last_attempt.lock().unwrap_or_else(|e| e.into_inner());
            match attempt.as_ref().filter(|(id, _)| *id == selected.id()) {
                Some((_, time)) => time.elapsed().as_secs(),
                None => status
                    .completed_at
                    .map(|time| now().saturating_sub(time).max(0) as u64)
                    .unwrap_or(u64::MAX),
            }
        };
        if schedule_due(&preferences, status.running, elapsed) {
            let _ = self.start();
        }
    }
    pub fn status(&self) -> SyncStatus {
        let status = self
            .status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if status.running {
            return status;
        }
        let Ok(selected) = Selection::saved(&self.db) else {
            return SyncStatus::default();
        };
        if status.source_id.as_deref() == Some(selected.id().as_str()) {
            return status;
        }
        let saved=self.db.connect().and_then(|conn|conn.query_row("SELECT last_sync,(SELECT count(*) FROM remote_locations WHERE source_id=remote_sources.id AND present=1) FROM remote_sources WHERE id=?",[selected.id()],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,usize>(1)?))).map_err(|e|e.to_string()));
        match saved {
            Ok((time, count)) => SyncStatus {
                completed_at: Some(time),
                source_id: Some(selected.id()),
                indexed: count,
                scanned: count,
                message: "Remote catalog available. Sync to check for changes.".into(),
                ..Default::default()
            },
            Err(_) => SyncStatus::default(),
        }
    }
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Release);
    }
    pub fn start(&self) -> Result<SyncStatus> {
        let selected = Selection::saved(&self.db)?;
        {
            let mut status = self.status.lock().map_err(|_| "Sync unavailable.")?;
            if status.running {
                return Err("A remote catalog sync is already running.".into());
            }
            *self.last_attempt.lock().map_err(|_| "Sync unavailable.")? =
                Some((selected.id(), std::time::Instant::now()));
            self.cancel.store(false, Ordering::Release);
            *status = SyncStatus {
                running: true,
                source_id: Some(selected.id()),
                message: "Connecting to selected music folder…".into(),
                ..Default::default()
            };
        }
        let worker = self.clone();
        std::thread::spawn(move || {
            let result = worker.scan(&selected);
            let mut status = worker.status.lock().unwrap_or_else(|e| e.into_inner());
            *worker
                .last_attempt
                .lock()
                .unwrap_or_else(|e| e.into_inner()) =
                Some((selected.id(), std::time::Instant::now()));
            status.running = false;
            match result {
                Ok(()) => {
                    if let Some(app) = &worker.app {
                        use tauri::Emitter;
                        let _ = app.emit("library-changed", ());
                    }
                    status.completed_at = Some(now());
                    status.message = if status.scanned == 0 {
                        "No supported music files found.".into()
                    } else {
                        "Remote catalog synced. Audio stays on the server.".into()
                    };
                }
                Err(e) if worker.cancel.load(Ordering::Acquire) => {
                    let _ = e;
                    status.message = "Sync cancelled. Previous catalog kept.".into();
                }
                Err(e) => {
                    status.message = "Sync stopped. Previous catalog kept.".into();
                    status.error = Some(e);
                }
            }
        });
        Ok(self.status())
    }
    fn check(&self, selected: &Selection) -> Result<()> {
        if self.cancel.load(Ordering::Acquire) {
            return Err("Sync cancelled.".into());
        }
        if !selected.current(&self.db) {
            return Err(
                "The selected SSH folder or server trust changed. Start Sync again.".into(),
            );
        }
        Ok(())
    }
    fn scan(&self, selected: &Selection) -> Result<()> {
        let mut session = selected.connect(self.connector.as_ref())?;
        let known: HashMap<String, (u64, u64)> = {
            let conn = self.db.connect()?;
            let mut stmt=conn.prepare("SELECT f.path,r.size,r.modified FROM remote_file_ids f JOIN remote_locations r ON r.track_id=f.track_id WHERE f.endpoint=? AND r.modified>0").map_err(|e|e.to_string())?;
            let rows = stmt
                .query_map([crate::catalog::endpoint(&selected.config)], |r| {
                    Ok((r.get(0)?, (r.get(1)?, r.get(2)?)))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<std::result::Result<_, _>>()
                .map_err(|e| e.to_string())?
        };
        let mut pending = vec![(String::new(), 0usize)];
        let mut directories = 0;
        let mut rows = Vec::new();
        while let Some((relative, depth)) = pending.pop() {
            self.check(selected)?;
            directories += 1;
            if directories > 2000 || depth > 32 {
                return Err("Folder limit reached. Select a smaller music folder.".into());
            }
            let path = format!(
                "{}/{}",
                selected.config.root.trim_end_matches('/'),
                relative
            );
            let canonical = session.canonical_directory(&path).map_err(|e| e.message)?;
            if canonical.trim_end_matches('/') != path.trim_end_matches('/') {
                return Err(
                    "Remote folder changed or contains a link. Select a stable music folder."
                        .into(),
                );
            }
            let (entries, truncated) = session.list(&path, 500).map_err(|e| e.message)?;
            if truncated {
                return Err(
                    "A folder has more than 500 entries. Select a smaller music folder.".into(),
                );
            }
            for entry in entries {
                if self.cancel.load(Ordering::Acquire) {
                    return Err("Sync cancelled.".into());
                }
                if rows.len() % 64 == 0 {
                    self.check(selected)?;
                }
                if entry.name.is_empty()
                    || entry.name.contains('/')
                    || matches!(entry.name.as_str(), "." | "..")
                {
                    return Err("Invalid remote filename.".into());
                }
                let relative = if relative.is_empty() {
                    entry.name
                } else {
                    format!("{relative}/{}", entry.name)
                };
                super::sftp::relative_path(&relative).map_err(|e| e.message)?;
                match entry.kind {
                    EntryKind::Directory => pending.push((relative, depth + 1)),
                    EntryKind::File if metadata::supported(Path::new(&relative)) => {
                        if rows.len() >= 10000 {
                            return Err(
                                "Track limit reached. Select a smaller music folder.".into()
                            );
                        }
                        let absolute = crate::catalog::remote_path(&selected.config, &relative)?;
                        let listed = entry
                            .size
                            .zip(entry.modified)
                            .filter(|(_, modified)| *modified > 0);
                        let listing_match =
                            listed.is_some_and(|facts| known.get(&absolute) == Some(&facts));
                        let (size, modified, tags, unchanged) = if listing_match {
                            let (size, modified) = listed.unwrap();
                            (size, modified, None, true)
                        } else {
                            let file = session
                                .open(&selected.config.root, &relative)
                                .map_err(|e| e.message)?;
                            let size = file.size;
                            let modified = file.modified;
                            let unchanged =
                                modified > 0 && known.get(&absolute) == Some(&(size, modified));
                            let tags = if unchanged {
                                None
                            } else {
                                let reader =
                                    CheckedReader::new(file, 24 * 1024 * 1024, self.cancel.clone());
                                let failed = reader.failed.clone();
                                let tags = metadata::read_remote(
                                    std::io::BufReader::with_capacity(64 * 1024, reader),
                                    Path::new(&relative),
                                    &self.db,
                                );
                                if failed.load(Ordering::Acquire) {
                                    return Err("Remote connection interrupted during Sync. Reconnect and retry.".into());
                                }
                                tags.ok()
                            };
                            (size, modified, tags, unchanged)
                        };
                        let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
                        status.scanned += 1;
                        if unchanged {
                            status.unchanged += 1;
                        }
                        if tags.is_none() && !unchanged {
                            status.skipped += 1;
                        } else {
                            status.indexed += 1;
                        }
                        status.message = format!(
                            "Checking remote catalog · {} files · {} unchanged",
                            status.scanned, status.unchanged
                        );
                        drop(status);
                        rows.push(CatalogRow {
                            relative,
                            size,
                            modified,
                            tags,
                        });
                    }
                    _ => {}
                }
            }
        }
        self.check(selected)?;
        commit(&self.db, selected, &rows, &self.cancel)
    }
}
struct CatalogRow {
    relative: String,
    size: u64,
    modified: u64,
    tags: Option<Metadata>,
}
fn track_id(source: &str, relative: &str) -> String {
    format!("{source}:{}", blake3::hash(relative.as_bytes()).to_hex())
}
fn commit(db: &Db, selected: &Selection, rows: &[CatalogRow], cancel: &AtomicBool) -> Result<()> {
    let mut conn = db.connect()?;
    // IMMEDIATE serializes the profile check and publication with settings writes.
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let json: String = tx
        .query_row(
            "SELECT value FROM settings WHERE key='providers.sftp.profile'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "SSH connection was removed.")?;
    let profile: Option<Config> =
        serde_json::from_str(&json).map_err(|_| "Invalid SSH profile.")?;
    if profile.as_ref() != Some(&selected.config) || !selected.current(db) {
        return Err("SSH selection changed. Sync again.".into());
    }
    let source = selected.id();
    tx.execute("INSERT INTO remote_sources(id,profile,last_sync) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile,last_sync=excluded.last_sync",params![source,serde_json::to_string(&selected.config).map_err(|e|e.to_string())?,now()]).map_err(|e|e.to_string())?;
    tx.execute(
        "UPDATE remote_locations SET present=0 WHERE source_id=?",
        [&source],
    )
    .map_err(|e| e.to_string())?;
    for row in rows {
        if cancel.load(Ordering::Acquire) {
            return Err("Sync cancelled.".into());
        }
        let id = crate::catalog::remote_identity(&tx, &selected.config, &row.relative)?
            .unwrap_or_else(|| track_id(&source, &row.relative));
        if let Some(m) = &row.tags {
            let album_id = crate::catalog::album_id(&selected.config, &m.album_id);
            tx.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,year,genre,duration,track_no,disc_no,cover,added_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,album_artist=excluded.album_artist,album_id=excluded.album_id,year=excluded.year,genre=excluded.genre,duration=excluded.duration,track_no=excluded.track_no,disc_no=excluded.disc_no,cover=excluded.cover",params![id,m.title,m.artist,m.album,m.album_artist,album_id,m.year,m.genre,m.duration,m.track_no,m.disc_no,m.cover,now()]).map_err(|e|e.to_string())?;
        }
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tracks WHERE id=?)",
                [&id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists {
            tx.execute("INSERT INTO remote_locations(track_id,source_id,relative,size,modified,present) VALUES (?,?,?,?,?,1) ON CONFLICT(track_id) DO UPDATE SET source_id=excluded.source_id,relative=excluded.relative,size=excluded.size,modified=excluded.modified,present=1",params![id,source,row.relative,row.size,row.modified]).map_err(|e|e.to_string())?;
            tx.execute(
                "INSERT OR IGNORE INTO remote_file_ids(endpoint,path,track_id) VALUES (?,?,?)",
                params![
                    crate::catalog::endpoint(&selected.config),
                    crate::catalog::remote_path(&selected.config, &row.relative)?,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    crate::catalog::reapply_overrides(&tx, None)?;

    if cancel.load(Ordering::Acquire) {
        return Err("Sync cancelled.".into());
    }
    tx.commit().map_err(|e| e.to_string())
}
pub fn open_track(db: &Db, id: &str, connector: &dyn Connector) -> Result<(RemoteFile, Selection)> {
    let selected = Selection::saved(db)?;
    let relative: String = db
        .connect()?
        .query_row(
            "SELECT relative FROM remote_locations WHERE track_id=? AND source_id=? AND present=1",
            params![id, selected.id()],
            |r| r.get(0),
        )
        .map_err(|_| {
            "This remote track is unavailable. Reconnect its source folder and Sync again."
        })?;
    let mut session = selected.connect(connector)?;
    let file = session
        .open(&selected.config.root, &relative)
        .map_err(|e| e.message)?;
    if !selected.current(db) {
        return Err("SSH selection changed. Try playing again.".into());
    }
    Ok((file, selected))
}

#[tauri::command]
pub fn sftp_auto_sync(state: tauri::State<'_, RemoteCatalog>) -> Result<AutoSync> {
    state.auto_settings()
}
#[tauri::command]
pub fn sftp_auto_sync_save(
    value: AutoSync,
    state: tauri::State<'_, RemoteCatalog>,
) -> Result<AutoSync> {
    state.save_auto_settings(value)
}
#[tauri::command]
pub fn sftp_sync_status(state: tauri::State<'_, RemoteCatalog>) -> SyncStatus {
    state.status()
}
#[tauri::command]
pub async fn sftp_sync_start(state: tauri::State<'_, RemoteCatalog>) -> Result<SyncStatus> {
    let catalog = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || catalog.start())
        .await
        .map_err(|_| "Could not start Sync.")?
}
#[tauri::command]
pub fn sftp_sync_cancel(state: tauri::State<'_, RemoteCatalog>) {
    state.cancel();
}

#[cfg(test)]
mod tests {
    use super::super::sftp::{self, RemoteEntry};
    use super::*;
    use std::{io::Cursor, sync::atomic::AtomicUsize};
    #[derive(Default)]
    struct Files {
        omit_facts: AtomicBool,
        opens: AtomicUsize,
        files: Mutex<BTreeMap<String, (Vec<u8>, u64)>>,
        reads: Arc<AtomicUsize>,
        auth: AtomicUsize,
        bad_key: AtomicBool,
        fail: AtomicBool,
        truncated: AtomicBool,
        block: AtomicBool,
        entered: AtomicBool,
    }
    struct Fake(Arc<Files>);
    fn key() -> HostKey {
        HostKey {
            algorithm: "ssh-ed25519".into(),
            fingerprint: "SHA256:test".into(),
        }
    }
    impl Connector for Fake {
        fn handshake(&self, _: &Config) -> sftp::Result<Box<dyn RemoteSession>> {
            Ok(Box::new(Fake(self.0.clone())))
        }
    }
    struct Counted {
        cursor: Cursor<Vec<u8>>,
        count: Arc<AtomicUsize>,
    }
    impl Read for Counted {
        fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
            let n = self.cursor.read(b)?;
            self.count.fetch_add(n, Ordering::Relaxed);
            Ok(n)
        }
    }
    impl Seek for Counted {
        fn seek(&mut self, p: SeekFrom) -> io::Result<u64> {
            self.cursor.seek(p)
        }
    }
    impl RemoteSession for Fake {
        fn host_key(&self) -> sftp::Result<HostKey> {
            let mut k = key();
            if self.0.bad_key.load(Ordering::Acquire) {
                k.fingerprint = "SHA256:changed".into();
            }
            Ok(k)
        }
        fn authenticate(&mut self, _: &Config) -> sftp::Result<()> {
            self.0.auth.fetch_add(1, Ordering::Relaxed);
            Ok(())
        }
        fn canonical_directory(&mut self, p: &str) -> sftp::Result<String> {
            sftp::absolute_path(p)
        }
        fn list(&mut self, path: &str, _: usize) -> sftp::Result<(Vec<RemoteEntry>, bool)> {
            self.0.entered.store(true, Ordering::Release);
            while self.0.block.load(Ordering::Acquire) {
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            if self.0.fail.load(Ordering::Acquire) {
                return Err(sftp::error(sftp::ErrorCode::Unreachable));
            }
            let files = self.0.files.lock().unwrap();
            let mut entries = BTreeMap::new();
            for (name, (bytes, mtime)) in files.iter() {
                if let Some(tail) = name.strip_prefix(&format!("{}/", path.trim_end_matches('/'))) {
                    let part = tail.split('/').next().unwrap();
                    entries.insert(
                        part.to_string(),
                        RemoteEntry {
                            name: part.into(),
                            kind: if tail.contains('/') {
                                EntryKind::Directory
                            } else {
                                EntryKind::File
                            },
                            size: Some(bytes.len() as u64),
                            modified: if self.0.omit_facts.load(Ordering::Relaxed) {
                                None
                            } else {
                                Some(*mtime)
                            },
                        },
                    );
                }
            }
            entries.insert(
                "link".into(),
                RemoteEntry {
                    name: "link".into(),
                    kind: EntryKind::Symlink,
                    size: None,
                    modified: None,
                },
            );
            Ok((
                entries.into_values().collect(),
                self.0.truncated.load(Ordering::Acquire),
            ))
        }
        fn open(&mut self, root: &str, relative: &str) -> sftp::Result<RemoteFile> {
            self.0.opens.fetch_add(1, Ordering::Relaxed);
            let relative = sftp::relative_path(relative)?;
            let files = self.0.files.lock().unwrap();
            let (bytes, mtime) = files
                .get(&format!("{root}/{relative}"))
                .ok_or_else(|| sftp::error(sftp::ErrorCode::FolderUnavailable))?;
            Ok(RemoteFile {
                reader: Box::new(Counted {
                    cursor: Cursor::new(bytes.clone()),
                    count: self.0.reads.clone(),
                }),
                size: bytes.len() as u64,
                modified: *mtime,
            })
        }
    }
    fn setup() -> (tempfile::TempDir, Db, Arc<Files>, RemoteCatalog, Selection) {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::new(dir.path()).unwrap();
        let config = Config {
            host: "music.example.test".into(),
            port: 2222,
            username: "listener".into(),
            root: "/music".into(),
            identity_file: None,
        };
        db.set_setting("providers.sftp.profile", &Some(config.clone()))
            .unwrap();
        db.set_setting(
            "providers.sftp.trusted_hosts",
            &BTreeMap::from([(config.endpoint(), key())]),
        )
        .unwrap();
        let files = Arc::new(Files::default());
        let catalog = RemoteCatalog::new(db.clone(), Arc::new(Fake(files.clone())));
        let selected = Selection::saved(&db).unwrap();
        (dir, db, files, catalog, selected)
    }
    fn audio(title: &str) -> Vec<u8> {
        use lofty::{
            file::{AudioFile, TaggedFileExt},
            tag::Accessor,
        };
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("track.mp3");
        std::fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/silence.mp3"),
            &path,
        )
        .unwrap();
        let mut file = lofty::read_from_path(&path).unwrap();
        if file.primary_tag().is_none() {
            file.insert_tag(lofty::tag::Tag::new(file.primary_tag_type()));
        }
        let tag = file.primary_tag_mut().unwrap();
        tag.set_title(title.into());
        tag.set_artist("Artist".into());
        tag.set_album("Album".into());
        tag.set_track(2);
        tag.set_year(2026);
        let mut picture = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(4, 4)
            .write_to(&mut picture, image::ImageFormat::Png)
            .unwrap();
        tag.push_picture(lofty::picture::Picture::new_unchecked(
            lofty::picture::PictureType::CoverFront,
            Some(lofty::picture::MimeType::Png),
            None,
            picture.into_inner(),
        ));
        file.save_to_path(&path, lofty::config::WriteOptions::default())
            .unwrap();
        std::fs::read(path).unwrap()
    }
    fn wait(catalog: &RemoteCatalog) -> SyncStatus {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while catalog.status().running {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        catalog.status()
    }
    #[test]
    fn missing_directory_timestamps_fall_back_to_open_without_re_reading_tags() {
        let (_dir, _db, files, catalog, selected) = setup();
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/a.mp3".into(), (audio("A"), 1));
        catalog.scan(&selected).unwrap();
        let opens = files.opens.load(Ordering::Relaxed);
        let bytes = files.reads.load(Ordering::Relaxed);
        files.omit_facts.store(true, Ordering::Release);
        catalog.scan(&selected).unwrap();
        assert_eq!(files.opens.load(Ordering::Relaxed), opens + 1);
        assert_eq!(files.reads.load(Ordering::Relaxed), bytes);
    }
    #[test]
    fn automatic_schedule_is_opt_in_bounded_and_respects_failed_or_cancelled_attempts() {
        let (dir, db, files, catalog, _) = setup();
        assert!(!catalog.auto_settings().unwrap().enabled);
        let enabled = AutoSync {
            enabled: true,
            interval_minutes: 5,
        };
        assert!(!schedule_due(&AutoSync::default(), false, u64::MAX));
        assert!(!schedule_due(&enabled, true, u64::MAX));
        assert!(!schedule_due(&enabled, false, 299));
        assert!(schedule_due(&enabled, false, 300));
        assert!(catalog
            .save_auto_settings(AutoSync {
                enabled: true,
                interval_minutes: 0
            })
            .is_err());
        catalog.save_auto_settings(enabled).unwrap();
        assert!(
            RemoteCatalog::new(db.clone(), Arc::new(Fake(files.clone())))
                .auto_settings()
                .unwrap()
                .enabled
        );
        files.fail.store(true, Ordering::Release);
        catalog.automatic_tick();
        assert!(wait(&catalog).error.is_some());
        let attempts = files.auth.load(Ordering::Relaxed);
        catalog.automatic_tick();
        assert_eq!(files.auth.load(Ordering::Relaxed), attempts);
        db.set_setting("providers.sftp.profile", &Option::<Config>::None)
            .unwrap();
        *catalog.last_attempt.lock().unwrap() = None;
        catalog.automatic_tick();
        assert_eq!(files.auth.load(Ordering::Relaxed), attempts);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn sync_maps_tags_and_artwork_incrementally_preserving_favourites_and_playlists() {
        let (dir, db, files, catalog, selected) = setup();
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/Artist/Album/a.mp3".into(), (audio("First"), 10));
        catalog.scan(&selected).unwrap();
        let id = track_id(&selected.id(), "Artist/Album/a.mp3");
        let t = db.track(&id).unwrap();
        assert_eq!(
            (
                t.title.as_str(),
                t.artist.as_str(),
                t.album.as_str(),
                t.year,
                t.track_no
            ),
            ("First", "Artist", "Album", Some(2026), 2)
        );
        assert!(t.album_id.starts_with(&format!(
            "sftp:{}:album:",
            crate::catalog::endpoint(&selected.config)
        )));
        assert!(t.available);
        assert!(Path::new(&t.cover.unwrap()).is_file());
        assert!(t.duration > 0.);
        db.favourite(&id, true).unwrap();
        let playlist = db
            .playlist("create", None, Some("Mixed"), vec![])
            .unwrap()
            .unwrap();
        db.playlist("add", Some(&playlist), None, vec![id.clone()])
            .unwrap();
        let bytes = files.reads.load(Ordering::Relaxed);
        let opens = files.opens.load(Ordering::Relaxed);
        catalog.scan(&selected).unwrap();
        assert_eq!(
            files.reads.load(Ordering::Relaxed),
            bytes,
            "unchanged files must not be read again"
        );
        assert_eq!(
            files.opens.load(Ordering::Relaxed),
            opens,
            "directory attributes must avoid opening unchanged files"
        );
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/Artist/Album/a.mp3".into(), (audio("Updated"), 11));
        catalog.scan(&selected).unwrap();
        let t = db.track(&id).unwrap();
        assert_eq!(t.title, "Updated");
        assert!(t.liked);
        assert_eq!(t.added_at, db.track(&id).unwrap().added_at);
        assert_eq!(
            db.tracks(&crate::models::TrackQuery {
                playlist_id: Some(playlist),
                limit: 10,
                ..Default::default()
            })
            .unwrap()
            .items[0]
                .id,
            id
        );
        let count: i64 = db
            .connect()
            .unwrap()
            .query_row("SELECT count(*) FROM locations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert!(std::fs::read_dir(dir.path()).unwrap().all(|e| !e
            .unwrap()
            .path()
            .extension()
            .is_some_and(|e| matches!(e.to_str(), Some("mp3" | "flac")))));
    }
    #[test]
    fn failures_cancellation_and_truncation_keep_previous_catalog_and_local_sources() {
        let (_dir, db, files, catalog, selected) = setup();
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/a.mp3".into(), (audio("Keep"), 1));
        catalog.scan(&selected).unwrap();
        let id = track_id(&selected.id(), "a.mp3");
        db.connect()
            .unwrap()
            .execute("INSERT INTO sources(id,path) VALUES('local','/local')", [])
            .unwrap();
        files.fail.store(true, Ordering::Release);
        assert!(catalog.scan(&selected).is_err());
        assert!(db.track(&id).unwrap().available);
        files.fail.store(false, Ordering::Release);
        files.truncated.store(true, Ordering::Release);
        assert!(catalog.scan(&selected).is_err());
        assert!(db.track(&id).unwrap().available);
        files.truncated.store(false, Ordering::Release);
        files.block.store(true, Ordering::Release);
        files.entered.store(false, Ordering::Release);
        catalog.start().unwrap();
        while !files.entered.load(Ordering::Acquire) {
            std::thread::yield_now();
        }
        assert!(catalog.start().is_err());
        catalog.cancel();
        files.block.store(false, Ordering::Release);
        assert!(wait(&catalog).message.contains("cancelled"));
        assert!(db.track(&id).unwrap().available);
        assert_eq!(db.sources().unwrap()[0].id, "local");
        catalog.cancel.store(false, Ordering::Release);
        files.files.lock().unwrap().clear();
        catalog.scan(&selected).unwrap();
        assert!(
            !db.track(&id).unwrap().available,
            "completed scan marks missing files unavailable without deleting preferences"
        );
    }
    #[test]
    fn changed_key_is_rejected_before_auth_and_source_changes_isolate_playback() {
        let (_dir, db, files, catalog, selected) = setup();
        files.bad_key.store(true, Ordering::Release);
        assert!(catalog.scan(&selected).is_err());
        assert_eq!(files.auth.load(Ordering::Relaxed), 0);
        files.bad_key.store(false, Ordering::Release);
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/a.mp3".into(), (audio("A"), 1));
        catalog.scan(&selected).unwrap();
        let id = track_id(&selected.id(), "a.mp3");
        assert!(open_track(&db, &id, &Fake(files.clone())).is_ok());
        let mut alternate_key = selected.config.clone();
        alternate_key.identity_file = Some("/tmp/alternate-private-key".into());
        db.set_setting("providers.sftp.profile", &Some(alternate_key))
            .unwrap();
        assert!(
            db.track(&id).unwrap().available,
            "changing a key path must not create another music source"
        );
        let mut other = selected.config.clone();
        other.root = "/another".into();
        db.set_setting("providers.sftp.profile", &Some(other))
            .unwrap();
        assert!(!selected.current(&db));
        assert!(!db.track(&id).unwrap().available);
        assert!(open_track(&db, &id, &Fake(files.clone())).is_err());
        db.set_setting("providers.sftp.profile", &Option::<Config>::None)
            .unwrap();
        assert!(Selection::saved(&db).is_err());
    }
    #[test]
    fn remote_codec_mapping_supports_alac_and_raw_aac_without_filesystem_audio_cache() {
        let (_dir, db, files, catalog, selected) = setup();
        for name in ["silence.aac", "silence-alac.m4a"] {
            let bytes = std::fs::read(
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures")
                    .join(name),
            )
            .unwrap();
            files
                .files
                .lock()
                .unwrap()
                .insert(format!("/music/{name}"), (bytes, 1));
        }
        catalog.scan(&selected).unwrap();
        assert_eq!(db.library().unwrap().tracks, 2);
    }
    #[test]
    fn bounded_reads_seek_without_copying_audio_and_report_io_failures() {
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("sensitive detail"))
            }
        }
        impl Seek for Broken {
            fn seek(&mut self, _: SeekFrom) -> io::Result<u64> {
                Err(io::Error::other("sensitive detail"))
            }
        }
        let cancel = Arc::new(AtomicBool::new(false));
        let mut reader = CheckedReader::new(
            RemoteFile {
                reader: Box::new(Cursor::new(vec![1; 1000])),
                size: 1000,
                modified: 1,
            },
            4,
            cancel.clone(),
        );
        let mut out = [0; 20];
        assert_eq!(reader.read(&mut out).unwrap(), 4);
        assert!(reader.read(&mut out).is_err());
        assert!(!reader.failed.load(Ordering::Acquire));
        let mut reader = CheckedReader::new(
            RemoteFile {
                reader: Box::new(Broken),
                size: 1,
                modified: 1,
            },
            4,
            cancel.clone(),
        );
        assert!(!reader
            .read(&mut out)
            .unwrap_err()
            .to_string()
            .contains("sensitive"));
        assert!(reader.failed.load(Ordering::Acquire));
        cancel.store(true, Ordering::Release);
        assert_eq!(
            reader.read(&mut out).unwrap_err().kind(),
            io::ErrorKind::Other
        );
    }
    #[test]
    fn cancelled_commit_does_not_publish_and_version_one_catalog_upgrades_additively() {
        let (dir, db, files, catalog, selected) = setup();
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/a.mp3".into(), (audio("A"), 1));
        catalog.scan(&selected).unwrap();
        assert!(commit(&db, &selected, &[], &AtomicBool::new(true)).is_err());
        assert!(
            db.track(&track_id(&selected.id(), "a.mp3"))
                .unwrap()
                .available
        );
        db.connect()
            .unwrap()
            .execute_batch("PRAGMA user_version=1")
            .unwrap();
        let upgraded = Db::new(dir.path()).unwrap();
        assert_eq!(upgraded.library().unwrap().tracks, 1);
        let version: i64 = upgraded
            .connect()
            .unwrap()
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 3);
    }
    #[test]
    fn overlapping_roots_reuse_canonical_file_ids_and_keep_user_metadata() {
        let (_dir, db, files, catalog, selected) = setup();
        files
            .files
            .lock()
            .unwrap()
            .insert("/music/Artist/Album/a.mp3".into(), (audio("A"), 1));
        catalog.scan(&selected).unwrap();
        let id = track_id(&selected.id(), "Artist/Album/a.mp3");
        let original_album = db.track(&id).unwrap().album_id;
        db.favourite(&id, true).unwrap();
        db.played(&id);
        let playlist = db
            .playlist("create", None, Some("Keep"), vec![])
            .unwrap()
            .unwrap();
        db.playlist("add", Some(&playlist), None, vec![id.clone()])
            .unwrap();
        let bytes = files.reads.load(Ordering::Relaxed);

        let mut config = selected.config.clone();
        config.root = "/music/Artist".into();
        db.set_setting("providers.sftp.profile", &Some(config))
            .unwrap();
        let nested = Selection::saved(&db).unwrap();
        catalog.scan(&nested).unwrap();
        catalog.scan(&nested).unwrap();
        assert_eq!(db.library().unwrap().tracks, 1);
        assert!(db.track(&id).unwrap().liked);
        assert_eq!(db.track(&id).unwrap().album_id, original_album);
        assert_eq!(files.reads.load(Ordering::Relaxed), bytes);
        assert_eq!(db.library().unwrap().playlists[0].tracks, 1);
        let conn = db.connect().unwrap();
        conn.execute("INSERT INTO album_overrides(id,title,artist,year,genre,cover,release_id,updated_at) VALUES (?,'Reviewed','Reviewed artist',2025,'Soul',NULL,'verified',1)",[&original_album]).unwrap();
        conn.execute(
            "INSERT INTO track_album_overrides(track_id,album_id) VALUES (?,?)",
            params![id, original_album],
        )
        .unwrap();
        drop(conn);
        files.files.lock().unwrap().insert(
            "/music/Artist/Album/a.mp3".into(),
            (audio("Changed tags"), 2),
        );
        catalog.scan(&nested).unwrap();
        assert_eq!(db.track(&id).unwrap().album, "Reviewed");
        assert_eq!(db.library().unwrap().tracks, 1);
        files.files.lock().unwrap().insert(
            "/music/Artist/Album/copy.mp3".into(),
            (audio("Changed tags"), 2),
        );
        catalog.scan(&nested).unwrap();
        assert_eq!(
            db.library().unwrap().tracks,
            2,
            "different files must not be merged by title alone"
        );
    }
}
