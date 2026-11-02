use super::*;
use profile::{Profile, VERSION};
pub(crate) fn calm() -> Profile {
    Profile {
        relaxed: 0.92,
        happy: 0.3,
        sad: 0.3,
        aggressive: 0.04,
        danceable: 0.25,
        instrumental: 0.85,
        energy: 0.2,
        confidence: 0.8,
        tempo: Some(80.),
        sample_seconds: 45.,
        model_version: VERSION.into(),
    }
}
pub(crate) fn fixture(count: usize) -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::new(dir.path()).unwrap();
    let conn = db.connect().unwrap();
    conn.execute(
        "INSERT INTO sources(id,path) VALUES ('local',?)",
        [dir.path().to_string_lossy().as_ref()],
    )
    .unwrap();
    for n in 0..count {
        let id = format!("track-{n}");
        let path = dir.path().join(format!("{n}.wav"));
        std::fs::write(&path, format!("synthetic-{n}")).unwrap();
        conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,genre,duration,track_no,disc_no,added_at) VALUES (?,?,?,'Album','Artist','album','Pop',180,1,1,1)",rusqlite::params![id,format!("Song {n}"),format!("Artist {}",n%4)]).unwrap();
        conn.execute("INSERT INTO locations(path,track_id,source_id,size,modified,hash,generation) VALUES (?,?,'local',16,'1','synthetic','scan')",rusqlite::params![path.to_string_lossy(),id]).unwrap();
        let track = db.track(&id).unwrap();
        profile::save(
            &db,
            &id,
            &profile::fingerprint(&db, &track).unwrap(),
            &calm(),
        )
        .unwrap();
    }
    (dir, db)
}
#[test]
fn cached_profiles_skip_unchanged_and_invalidate_changed_unavailable_and_model_versions() {
    let (dir, db) = fixture(1);
    let track = db.track("track-0").unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_some());
    let stamp = profile::fingerprint(&db, &track).unwrap();
    std::fs::write(dir.path().join("0.wav"), "changed synthetic length").unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_none());
    assert!(profile::save(&db, &track.id, &stamp, &calm()).is_err());
    let new = profile::fingerprint(&db, &track).unwrap();
    profile::save(&db, &track.id, &new, &calm()).unwrap();
    db.connect()
        .unwrap()
        .execute("UPDATE music_profiles SET model_version='old'", [])
        .unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_none());
    db.connect()
        .unwrap()
        .execute("UPDATE sources SET available=0", [])
        .unwrap();
    assert!(profile::cached(&db, &db.track(&track.id).unwrap()).is_err());
}
#[test]
fn high_energy_tracks_do_not_enter_chill_and_uncertain_scores_are_not_forced() {
    let mut value = calm();
    assert!(profile::mood_score(&value, "Chill").is_some());
    value.relaxed = 0.1;
    value.energy = 0.9;
    value.danceable = 0.95;
    assert!(profile::mood_score(&value, "Chill").is_none());
    assert!(profile::mood_score(&value, "Dance").is_some());
    value.confidence = 0.1;
    assert!(profile::mood_score(&value, "Dance").is_none());
    value.energy = f64::NAN;
    assert!(!value.validate());
}
#[test]
fn corrections_are_separate_and_deleting_track_cleans_profiles_and_overrides() {
    let (_dir, db) = fixture(1);
    let service = MusicProfiles::new(db.clone());
    service.correct("track-0", "Chill", Some(false)).unwrap();
    assert_eq!(
        service.review().unwrap()[0].overrides.get("Chill"),
        Some(&false)
    );
    assert_eq!(
        profile::cached(&db, &db.track("track-0").unwrap())
            .unwrap()
            .unwrap()
            .relaxed,
        0.92
    );
    service.correct("track-0", "Chill", None).unwrap();
    assert!(service.review().unwrap()[0].overrides.is_empty());
    assert!(service
        .correct("track-0", "unsupported", Some(true))
        .is_err());
    let conn = db.connect().unwrap();
    conn.execute("DELETE FROM locations", []).unwrap();
    conn.execute("DELETE FROM tracks", []).unwrap();
    assert_eq!(
        conn.query_row("SELECT count(*) FROM music_profiles", [], |r| r
            .get::<_, u64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn cancelled_analysis_never_starts_decoding_and_does_not_clear_cached_profiles() {
    let (_dir, db) = fixture(1);
    let service = MusicProfiles::new(db.clone());
    service.cancel();
    assert!(service.analyse(20, false).is_err());
    assert!(profile::cached(&db, &db.track("track-0").unwrap())
        .unwrap()
        .is_some());
}
#[test]
#[ignore = "downloads pinned public runtime/model pack; uses generated PCM only"]
fn real_managed_pack_install_and_local_inference() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("models");
    let cancel = Arc::new(AtomicBool::new(false));
    runtime::install(&root, cancel.clone(), |_| {}).unwrap();
    assert!(runtime::ready(&root));
    let mut worker = runtime::Worker::start(&root, cancel).unwrap();
    let samples = (0..16000 * 12)
        .map(|n| (std::f32::consts::TAU * 220. * n as f32 / 16000.).sin() * 0.2)
        .collect();
    let result = worker.infer(samples).unwrap();
    assert!(result.validate());
    assert_eq!(result.sample_seconds, 12.);
    drop(worker);
}
#[test]
fn unchanged_background_pass_does_not_start_models_or_reanalyse_audio() {
    let (_dir, db) = fixture(4);
    let service = MusicProfiles::new(db);
    service.analyse(20, true).unwrap();
    let status = service.status().unwrap();
    assert_eq!(status.skipped, 4);
    assert_eq!(status.completed, 0);
    assert!(!status.running);
}
#[test]
fn remote_profiles_invalidate_on_file_or_host_identity_changes_and_disconnect() {
    use crate::providers::sftp::{Config, HostKey};
    let dir = tempfile::tempdir().unwrap();
    let db = Db::new(dir.path()).unwrap();
    let config = Config {
        host: "music.example.test".into(),
        port: 2222,
        username: "listener".into(),
        root: "/music".into(),
        identity_file: None,
    };
    db.set_setting("providers.sftp.profile", &Some(&config))
        .unwrap();
    let mut trust = std::collections::BTreeMap::from([(
        "[music.example.test]:2222".to_string(),
        HostKey {
            algorithm: "ssh-ed25519".into(),
            fingerprint: "SHA256:synthetic-one".into(),
        },
    )]);
    db.set_setting("providers.sftp.trusted_hosts", &trust)
        .unwrap();
    let selected = crate::providers::remote::Selection::saved(&db).unwrap();
    let conn = db.connect().unwrap();
    conn.execute(
        "INSERT INTO remote_sources(id,profile) VALUES (?,?)",
        rusqlite::params![selected.id(), serde_json::to_string(&config).unwrap()],
    )
    .unwrap();
    conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,genre,duration,track_no,disc_no,added_at) VALUES ('sftp:test','Song','Artist','Album','Artist','album','Pop',180,1,1,1)",[]).unwrap();
    conn.execute("INSERT INTO remote_locations(track_id,source_id,relative,size,modified) VALUES ('sftp:test',?,'song.flac',100,10)",[selected.id()]).unwrap();
    let track = db.track("sftp:test").unwrap();
    assert!(track.available);
    let stamp = profile::fingerprint(&db, &track).unwrap();
    profile::save(&db, &track.id, &stamp, &calm()).unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_some());
    conn.execute("UPDATE remote_locations SET modified=11", [])
        .unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_none());
    conn.execute("UPDATE remote_locations SET modified=10", [])
        .unwrap();
    trust
        .get_mut(&"[music.example.test]:2222".to_string())
        .unwrap()
        .fingerprint = "SHA256:synthetic-two".into();
    db.set_setting("providers.sftp.trusted_hosts", &trust)
        .unwrap();
    assert!(profile::cached(&db, &track).unwrap().is_none());
    db.set_setting("providers.sftp.profile", &Option::<Config>::None)
        .unwrap();
    assert!(!db.track(&track.id).unwrap().available);
}
