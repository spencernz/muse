use crate::{
    db::{self, Db, Result},
    metadata,
    models::{ScanProgress, SourceFolder},
};
use notify::{RecursiveMode, Watcher};
use rusqlite::{params, OptionalExtension};
use std::{
    collections::HashSet,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

#[derive(Clone)]
pub struct Scanner {
    sender: mpsc::Sender<()>,
    pub progress: Arc<Mutex<ScanProgress>>,
    cancel: Arc<AtomicBool>,
}

impl Scanner {
    pub fn start(db: Db, app: AppHandle) -> Self {
        let (sender, rx) = mpsc::channel();
        let progress = Arc::new(Mutex::new(ScanProgress::default()));
        let cancel = Arc::new(AtomicBool::new(false));
        let result = Self {
            sender: sender.clone(),
            progress: progress.clone(),
            cancel: cancel.clone(),
        };
        std::thread::Builder::new()
            .name("muse-indexer".into())
            .spawn(move || {
                let notify_sender = sender.clone();
                let mut watcher =
                    notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                        if let Ok(event) = event {
                            if !matches!(event.kind, notify::EventKind::Access(_)) {
                                let _ = notify_sender.send(());
                            }
                        }
                    })
                    .ok();
                let mut watched = HashSet::new();
                loop {
                    // Debounce file bursts; periodically retry disconnected volumes.
                    let _ = rx.recv_timeout(Duration::from_secs(30));
                    let debounce = Instant::now();
                    while debounce.elapsed() < Duration::from_secs(2)
                        && rx.recv_timeout(Duration::from_millis(350)).is_ok()
                    {}
                    cancel.store(false, Ordering::Relaxed);
                    let mut report = ScanProgress {
                        running: true,
                        ..Default::default()
                    };
                    publish(&app, &progress, &report);
                    let sources = db.sources().unwrap_or_default();
                    if let Some(watcher) = watcher.as_mut() {
                        for source in &sources {
                            if !watched.contains(&source.path)
                                && Path::new(&source.path).is_dir()
                                && watcher
                                    .watch(Path::new(&source.path), RecursiveMode::Recursive)
                                    .is_ok()
                            {
                                watched.insert(source.path.clone());
                            }
                        }
                        let active: HashSet<_> = sources.iter().map(|s| s.path.clone()).collect();
                        for path in watched.clone().difference(&active) {
                            let _ = watcher.unwatch(Path::new(path));
                            watched.remove(path);
                        }
                    }
                    let mut last_library_event = Instant::now();
                    for source in sources {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        if let Err(error) = scan_source(&db, &source, &cancel, &mut report, |p| {
                            publish(&app, &progress, p);
                            if p.changed > 0
                                && last_library_event.elapsed() > Duration::from_millis(750)
                            {
                                let _ = app.emit("library-changed", ());
                                last_library_event = Instant::now();
                            }
                        }) {
                            report.errors += 1;
                            if let Ok(conn) = db.connect() {
                                let _ = conn.execute(
                                    "UPDATE sources SET error=? WHERE id=?",
                                    params![error, source.id],
                                );
                            }
                            report.changed += 1;
                            report.message = error;
                        }
                    }
                    report.running = false;
                    report.current.clear();
                    if cancel.load(Ordering::Relaxed) {
                        report.message =
                            "Scan stopped. Existing library entries were retained.".into();
                    } else if report.message.is_empty() {
                        report.message = format!(
                            "{} files checked · {} updated · {} skipped",
                            report.scanned, report.changed, report.errors
                        );
                    }
                    publish(&app, &progress, &report);
                    if report.changed > 0 || report.errors > 0 {
                        let _ = app.emit("library-changed", ());
                    }
                }
            })
            .expect("create indexer thread");
        result.request();
        result
    }
    pub fn request(&self) {
        let _ = self.sender.send(());
    }
    pub fn stop(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }
}

fn publish(app: &AppHandle, state: &Mutex<ScanProgress>, value: &ScanProgress) {
    if let Ok(mut state) = state.lock() {
        *state = value.clone();
    }
    let _ = app.emit("scan-progress", value);
}

pub fn scan_source(
    db: &Db,
    source: &SourceFolder,
    cancel: &AtomicBool,
    report: &mut ScanProgress,
    mut publish: impl FnMut(&ScanProgress),
) -> Result<()> {
    let mut conn = db.connect()?;
    let root = Path::new(&source.path);
    if !root.is_dir() {
        if source.available {
            report.changed += 1;
        }
        conn.execute("UPDATE sources SET available=0,error='Folder unavailable. Reconnect its drive to resume indexing.' WHERE id=?",[&source.id]).map_err(|e|e.to_string())?;
        return Ok(());
    }
    if !source.available || source.error.is_some() {
        report.changed += 1;
    }
    // Failure to enumerate must not mark existing files as deleted.
    std::fs::read_dir(root).map_err(|e| format!("Cannot read {}: {e}", source.path))?;
    conn.execute(
        "UPDATE sources SET available=1,error=NULL WHERE id=?",
        [&source.id],
    )
    .map_err(|e| e.to_string())?;
    let generation = uuid::Uuid::new_v4().to_string();
    let mut incomplete = false;
    let mut tick = Instant::now();
    let mut tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
    {
        if cancel.load(Ordering::Relaxed) {
            incomplete = true;
            break;
        }
        let entry = match item {
            Ok(e) => e,
            Err(error) => {
                report.errors += 1;
                incomplete = true;
                let _=tx.execute("INSERT OR REPLACE INTO scan_issues(path,source_id,error,generation) VALUES (?,?,?,?)",params![error.path().unwrap_or(root).to_string_lossy(),source.id,error.to_string(),generation]);
                continue;
            }
        };
        if !entry.file_type().is_file() || !metadata::supported(entry.path()) {
            continue;
        }
        let path = entry.path();
        if path.starts_with(&db.artwork) {
            continue;
        }
        report.scanned += 1;
        report.current = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into();
        match index_file(&tx, db, &source.id, path, &generation) {
            Ok(changed) => {
                report.changed += usize::from(changed);
                report.changed += tx
                    .execute(
                        "DELETE FROM scan_issues WHERE path=?",
                        [path.to_string_lossy()],
                    )
                    .map_err(|e| e.to_string())?;
            }
            Err(error) => {
                report.errors += 1; // Keep old locations visible, even if tag reading failed.
                let _=tx.execute("INSERT OR REPLACE INTO scan_issues(path,source_id,error,generation) VALUES (?,?,?,?)",params![path.to_string_lossy(),source.id,error,generation]);
                let _ = tx.execute(
                    "UPDATE locations SET generation=? WHERE path=?",
                    params![generation, path.to_string_lossy()],
                );
            }
        }
        if report.scanned.is_multiple_of(100) {
            tx.commit().map_err(|e| e.to_string())?;
            publish(report);
            tx = conn.transaction().map_err(|e| e.to_string())?;
        } else if tick.elapsed() > Duration::from_millis(200) {
            publish(report);
            tick = Instant::now();
        }
    }
    if !incomplete {
        report.changed += tx
            .execute(
                "DELETE FROM scan_issues WHERE source_id=? AND generation<>?",
                params![source.id, generation],
            )
            .map_err(|e| e.to_string())?;
        report.changed += tx
            .execute(
                "UPDATE locations SET present=0 WHERE source_id=? AND generation<>? AND present<>0",
                params![source.id, generation],
            )
            .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE sources SET last_scan=?,error=NULL WHERE id=?",
            params![db::now(), source.id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        tx.execute("UPDATE sources SET error='Some folders could not be read; previous entries were retained.' WHERE id=?",[&source.id]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn index_file(
    conn: &rusqlite::Connection,
    db: &Db,
    source_id: &str,
    path: &Path,
    generation: &str,
) -> Result<bool> {
    let stat = path.metadata().map_err(|e| e.to_string())?;
    let modified = stat
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos().to_string())
        .unwrap_or_default();
    let path_str = path.to_string_lossy();
    let old: Option<(u64, String)> = conn
        .query_row(
            "SELECT size,modified FROM locations WHERE path=?",
            [path_str.as_ref()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if old == Some((stat.len(), modified.clone())) {
        conn.execute(
            "UPDATE locations SET present=1,generation=?,source_id=? WHERE path=?",
            params![generation, source_id, path_str],
        )
        .map_err(|e| e.to_string())?;
        return Ok(false);
    }
    let hash = metadata::hash(path)?;
    let id =
        db::lookup_id(conn, &path_str, &hash)?.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let m = metadata::read(path, db)?;
    conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,year,genre,duration,track_no,disc_no,cover,added_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,album_artist=excluded.album_artist,album_id=excluded.album_id,year=excluded.year,genre=excluded.genre,duration=excluded.duration,track_no=excluded.track_no,disc_no=excluded.disc_no,cover=excluded.cover",params![id,m.title,m.artist,m.album,m.album_artist,m.album_id,m.year,m.genre,m.duration,m.track_no,m.disc_no,m.cover,db::now()]).map_err(|e|e.to_string())?;
    conn.execute("INSERT INTO locations(path,track_id,source_id,size,modified,hash,present,generation) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(path) DO UPDATE SET track_id=excluded.track_id,source_id=excluded.source_id,size=excluded.size,modified=excluded.modified,hash=excluded.hash,present=1,generation=excluded.generation",params![path_str,id,source_id,stat.len(),modified,hash,generation]).map_err(|e|e.to_string())?;
    crate::catalog::reapply_overrides(conn, Some(&id))?;
    Ok(true)
}
