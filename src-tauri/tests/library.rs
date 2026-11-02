use muse_lib::{
    db::Db,
    models::{ScanProgress, TrackQuery},
    scanner::scan_source,
};
use rusqlite::params;
use std::{fs, path::Path, sync::atomic::AtomicBool, time::Instant};

fn wave(path: &Path, frequency: f32) {
    let rate = 8000u32;
    let frames = rate;
    let size = frames * 2;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((36 + size).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(rate.to_le_bytes());
    bytes.extend((rate * 2).to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(size.to_le_bytes());
    for i in 0..frames {
        let sample =
            (((i as f32 * frequency * std::f32::consts::TAU / rate as f32).sin()) * 100.) as i16;
        bytes.extend(sample.to_le_bytes());
    }
    fs::write(path, bytes).unwrap();
}
fn scan(db: &Db) -> ScanProgress {
    let source = db.sources().unwrap().remove(0);
    let mut progress = ScanProgress::default();
    scan_source(db, &source, &AtomicBool::new(false), &mut progress, |_| {}).unwrap();
    progress
}
fn all(db: &Db) -> Vec<muse_lib::models::Track> {
    db.tracks(&TrackQuery {
        limit: 500,
        ..Default::default()
    })
    .unwrap()
    .items
}

#[test]
fn scanning_is_incremental_deduplicates_moves_and_preserves_preferences() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    let path = music.join("First.wav");
    wave(&path, 440.);
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    assert_eq!(scan(&db).changed, 1);
    let first = all(&db).remove(0);
    assert_eq!(first.title, "First");
    assert!(first.available);
    assert!(first.duration > 0.9);
    db.favourite(&first.id, true).unwrap();
    db.playlist("create", None, Some("Evening"), vec![])
        .unwrap();
    let playlist = db.library().unwrap().playlists.remove(0);
    db.playlist("add", Some(&playlist.id), None, vec![first.id.clone()])
        .unwrap();
    assert_eq!(scan(&db).changed, 0);
    let bytes = fs::read(&path).unwrap();
    let renamed = music.join("Moved.wav");
    fs::rename(&path, &renamed).unwrap();
    scan(&db);
    assert_eq!(all(&db).len(), 1);
    assert_eq!(all(&db)[0].id, first.id);
    assert!(all(&db)[0].liked);
    assert_eq!(db.library().unwrap().playlists[0].tracks, 1);
    assert_eq!(fs::read(&renamed).unwrap(), bytes);
    fs::copy(&renamed, music.join("Duplicate.wav")).unwrap();
    scan(&db);
    assert_eq!(all(&db).len(), 1);
    fs::remove_file(&renamed).unwrap();
    scan(&db);
    assert!(all(&db)[0].available);
    fs::remove_file(music.join("Duplicate.wav")).unwrap();
    scan(&db);
    let track = &all(&db)[0];
    assert!(!track.available);
    assert!(track.liked);
    assert!(db.file_for(&track.id).is_err());
    assert_eq!(db.library().unwrap().playlists[0].tracks, 1);
    let reopened = Db::new(&temp.path().join("data")).unwrap();
    assert_eq!(all(&reopened)[0].id, first.id);
    assert!(all(&reopened)[0].liked);
}

#[test]
fn missing_drive_and_cancel_do_not_erase_the_catalog() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    wave(&music.join("Song.wav"), 440.);
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    scan(&db);
    let id = all(&db)[0].id.clone();
    fs::rename(&music, temp.path().join("offline")).unwrap();
    scan(&db);
    assert!(!all(&db)[0].available);
    assert_eq!(all(&db).len(), 1);
    assert!(!db.sources().unwrap()[0].available);
    fs::rename(temp.path().join("offline"), &music).unwrap();
    scan(&db);
    assert!(all(&db)[0].available);
    assert_eq!(all(&db)[0].id, id);
    let mut progress = ScanProgress::default();
    scan_source(
        &db,
        &db.sources().unwrap()[0],
        &AtomicBool::new(true),
        &mut progress,
        |_| {},
    )
    .unwrap();
    assert!(all(&db)[0].available);
}

#[test]
fn corrupt_and_linked_files_do_not_break_scanning() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    wave(&music.join("Good.wav"), 440.);
    fs::write(music.join("Bad.mp3"), b"broken").unwrap();
    fs::write(music.join("Readme.txt"), b"ignore").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(music.join("Good.wav"), music.join("Linked.wav")).unwrap();
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    let progress = scan(&db);
    assert_eq!(progress.errors, 1);
    assert_eq!(all(&db).len(), 1);
    assert_eq!(db.library().unwrap().issues.len(), 1);
    fs::remove_file(music.join("Bad.mp3")).unwrap();
    scan(&db);
    assert!(db.library().unwrap().issues.is_empty());
}

#[test]
fn metadata_formats_and_source_bytes_are_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for suffix in ["mp3", "flac", "m4a"] {
        let source = fixtures.join(format!("silence.{suffix}"));
        fs::copy(&source, music.join(format!("Sample.{suffix}"))).unwrap();
    }
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    let progress = scan(&db);
    assert_eq!(progress.errors, 0);
    assert_eq!(all(&db).len(), 3);
    for suffix in ["mp3", "flac", "m4a"] {
        assert_eq!(
            fs::read(fixtures.join(format!("silence.{suffix}"))).unwrap(),
            fs::read(music.join(format!("Sample.{suffix}"))).unwrap()
        );
    }
}

#[test]
fn ten_thousand_tracks_are_searchable_paged_and_playlist_ordered() {
    let temp = tempfile::tempdir().unwrap();
    let db = Db::new(temp.path()).unwrap();
    let mut conn = db.connect().unwrap();
    let tx = conn.transaction().unwrap();
    for i in 0..12000 {
        tx.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,year,genre,duration,track_no,disc_no,added_at) VALUES (?,?,?,?,?,?,2026,'Ambient',180,1,1,?)",params![format!("id{i}"),format!("Song {i:05}"),format!("Artist {}",i%100),format!("Album {}",i%100),format!("Artist {}",i%100),format!("album{}",i%100),i]).unwrap();
    }
    tx.commit().unwrap();
    let start = Instant::now();
    let result = db
        .tracks(&TrackQuery {
            search: "Song 000".into(),
            limit: 200,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(result.total, 100);
    assert_eq!(result.items.len(), 100);
    let search_time = start.elapsed();
    let page = db
        .tracks(&TrackQuery {
            offset: 10000,
            limit: 200,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(page.total, 12000);
    assert_eq!(page.items.len(), 200);
    assert_eq!(page.items[0].title, "Song 10000");
    db.playlist("create", None, Some("Ordered"), vec![])
        .unwrap();
    let id = db.library().unwrap().playlists[0].id.clone();
    db.playlist(
        "add",
        Some(&id),
        None,
        vec!["id12".into(), "id1".into(), "id12".into()],
    )
    .unwrap();
    let query = TrackQuery {
        playlist_id: Some(id.clone()),
        limit: 200,
        ..Default::default()
    };
    let result = db.tracks(&query).unwrap();
    assert_eq!(
        result
            .items
            .iter()
            .map(|t| t.id.as_str())
            .collect::<Vec<_>>(),
        vec!["id12", "id1"]
    );
    assert_eq!(db.track_ids(&query).unwrap(), vec!["id12", "id1"]);
    db.favourite("id1", true).unwrap();
    assert_eq!(
        db.tracks(&TrackQuery {
            favourites: true,
            limit: 200,
            ..Default::default()
        })
        .unwrap()
        .total,
        1
    );
    db.playlist("delete", Some(&id), None, vec![]).unwrap();
    assert_eq!(db.library().unwrap().tracks, 12000);
    assert!(db.track("id1").unwrap().liked);
    println!("12,000-track prefix search: {search_time:?}");
    assert!(search_time.as_secs_f64() < 2.);
}

#[test]
fn removing_folder_removes_its_catalog_and_references_but_not_audio_files() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("music");
    fs::create_dir(&folder).unwrap();
    let path = folder.join("sample.wav");
    wave(&path, 440.);
    let db = Db::new(&dir.path().join("data")).unwrap();
    db.add_sources(vec![folder.to_string_lossy().into()])
        .unwrap();
    scan(&db);
    let song = all(&db).remove(0);
    let list = db
        .playlist("create", None, Some("Saved"), vec![])
        .unwrap()
        .unwrap();
    db.playlist("add", Some(&list), None, vec![song.id.clone()])
        .unwrap();
    db.played(&song.id);
    db.remove_source(&db.sources().unwrap()[0].id).unwrap();
    assert_eq!(
        db.library().unwrap().tracks,
        0,
        "removing the only source must remove its songs from the library"
    );
    assert!(db.library().unwrap().albums.is_empty());
    assert!(db.library().unwrap().artists.is_empty());
    assert_eq!(db.library().unwrap().playlists[0].tracks, 0);
    assert!(db.track(&song.id).is_err());
    assert!(path.is_file());
    let history: i64 = db
        .connect()
        .unwrap()
        .query_row("SELECT count(*) FROM history", [], |r| r.get(0))
        .unwrap();
    assert_eq!(history, 0);
    assert_eq!(
        db.tracks(&TrackQuery {
            search: "sample".into(),
            limit: 10,
            ..Default::default()
        })
        .unwrap()
        .total,
        0
    );
}

#[test]
fn removing_one_folder_preserves_tracks_with_another_even_offline_location() {
    let dir = tempfile::tempdir().unwrap();
    let a = dir.path().join("A");
    let b = dir.path().join("B");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    wave(&a.join("same.wav"), 440.);
    fs::copy(a.join("same.wav"), b.join("same.wav")).unwrap();
    let db = Db::new(&dir.path().join("data")).unwrap();
    db.add_sources(vec![a.to_string_lossy().into(), b.to_string_lossy().into()])
        .unwrap();
    let sources = db.sources().unwrap();
    for source in &sources {
        scan_source(
            &db,
            source,
            &AtomicBool::new(false),
            &mut ScanProgress::default(),
            |_| {},
        )
        .unwrap();
    }
    assert_eq!(db.library().unwrap().tracks, 1);
    let id = all(&db)[0].id.clone();
    db.favourite(&id, true).unwrap();
    db.connect()
        .unwrap()
        .execute(
            "UPDATE sources SET available=0 WHERE id=?",
            [&sources[1].id],
        )
        .unwrap();
    let removed = db.remove_source(&sources[0].id).unwrap();
    assert!(removed.is_empty());
    assert!(db.track(&id).unwrap().liked);
    assert!(!db.track(&id).unwrap().available);
    assert_eq!(db.library().unwrap().tracks, 1);
    // A remote location also protects a catalog identity from local-source deletion.
    db.connect()
        .unwrap()
        .execute(
            "INSERT INTO remote_sources(id,profile) VALUES('remote','{}')",
            [],
        )
        .unwrap();
    db.connect().unwrap().execute("INSERT INTO remote_locations(track_id,source_id,relative,size,modified) VALUES (?,'remote','song.wav',1,1)",[&id]).unwrap();
    db.remove_source(&sources[1].id).unwrap();
    assert_eq!(db.library().unwrap().tracks, 1);
    assert!(db.track(&id).unwrap().liked);
    assert!(a.join("same.wav").is_file());
    assert!(b.join("same.wav").is_file());
}
#[test]
fn startup_repairs_old_orphans_and_prunes_persisted_playback_and_album_tiles() {
    use muse_lib::models::{Playback, Tile};
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("music");
    fs::create_dir(&folder).unwrap();
    wave(&folder.join("song.wav"), 440.);
    let root = dir.path().join("data");
    let db = Db::new(&root).unwrap();
    db.add_sources(vec![folder.to_string_lossy().into()])
        .unwrap();
    scan(&db);
    let song = all(&db).remove(0);
    db.set_setting(
        "playback",
        &Playback {
            queue: vec![song.id.clone()],
            current: Some(song.clone()),
            playing: true,
            position: 30.,
            ..Default::default()
        },
    )
    .unwrap();
    db.set_setting(
        "tiles",
        &vec![
            Tile {
                id: "pin".into(),
                kind: "album".into(),
                size: "small".into(),
                target: Some(song.album_id),
            },
            Tile {
                id: "favourites".into(),
                kind: "favourites".into(),
                size: "small".into(),
                target: None,
            },
        ],
    )
    .unwrap();
    db.connect()
        .unwrap()
        .execute("DELETE FROM sources", [])
        .unwrap(); // Earlier releases left the track behind.
    assert_eq!(db.library().unwrap().tracks, 1);
    let repaired = Db::new(&root).unwrap();
    assert_eq!(repaired.library().unwrap().tracks, 0);
    let saved: Playback = repaired.setting("playback").unwrap();
    assert!(saved.current.is_none());
    assert!(saved.queue.is_empty());
    assert!(!saved.playing);
    assert_eq!(saved.position, 0.);
    assert_eq!(repaired.library().unwrap().tiles.len(), 1);
    assert_eq!(repaired.library().unwrap().tiles[0].kind, "favourites");
    assert!(folder.join("song.wav").exists());
}
#[test]
fn pruning_deleted_queue_ids_keeps_an_unrelated_track_and_its_position() {
    use muse_lib::models::{prune_playback, Playback};
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("music");
    fs::create_dir(&folder).unwrap();
    wave(&folder.join("keep.wav"), 440.);
    let db = Db::new(&dir.path().join("data")).unwrap();
    db.add_sources(vec![folder.to_string_lossy().into()])
        .unwrap();
    scan(&db);
    let song = all(&db).remove(0);
    let mut playback = Playback {
        queue: vec!["deleted".into(), song.id.clone()],
        index: 1,
        current: Some(song.clone()),
        playing: true,
        position: 31.,
        shuffle: true,
        repeat: "all".into(),
        volume: 0.3,
        ..Default::default()
    };
    assert!(!prune_playback(&mut playback, &["deleted".into()]));
    assert_eq!(playback.queue, vec![song.id.clone()]);
    assert_eq!(playback.index, 0);
    assert_eq!(playback.position, 31.);
    assert!(playback.playing);
    assert!(playback.shuffle);
    assert_eq!(playback.repeat, "all");
    assert_eq!(playback.volume, 0.3);
    assert!(prune_playback(&mut playback, &[song.id]));
    assert!(playback.queue.is_empty());
    assert!(playback.current.is_none());
    assert!(!playback.playing);
}
