use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::Accessor,
};
use muse_lib::{
    db::Db,
    models::{ScanProgress, TrackQuery},
    scanner::scan_source,
};
use rodio::Source;
use std::{fs, path::Path, sync::atomic::AtomicBool};

fn rescan(db: &Db) {
    scan_source(
        db,
        &db.sources().unwrap()[0],
        &AtomicBool::new(false),
        &mut ScanProgress::default(),
        |_| {},
    )
    .unwrap();
}

#[test]
fn raw_aac_and_alac_are_indexed_and_decodable() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for name in ["silence.aac", "silence-alac.m4a"] {
        fs::copy(fixtures.join(name), music.join(name)).unwrap();
        let mut decoder =
            rodio::Decoder::try_from(fs::File::open(music.join(name)).unwrap()).unwrap();
        assert!(decoder.next().is_some());
    }
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    let mut report = ScanProgress::default();
    scan_source(
        &db,
        &db.sources().unwrap()[0],
        &AtomicBool::new(false),
        &mut report,
        |_| {},
    )
    .unwrap();
    assert_eq!(report.errors, 0);
    assert_eq!(db.library().unwrap().tracks, 2);
}

#[test]
fn metadata_changes_keep_identity_and_cache_embedded_artwork() {
    let temp = tempfile::tempdir().unwrap();
    let music = temp.path().join("music");
    fs::create_dir(&music).unwrap();
    let path = music.join("Sample.mp3");
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/silence.mp3"),
        &path,
    )
    .unwrap();
    let db = Db::new(&temp.path().join("data")).unwrap();
    db.add_sources(vec![music.to_string_lossy().into()])
        .unwrap();
    rescan(&db);
    let id = db.track_ids(&TrackQuery::default()).unwrap()[0].clone();
    db.favourite(&id, true).unwrap();
    let mut file = lofty::read_from_path(&path).unwrap();
    if file.primary_tag().is_none() {
        file.insert_tag(lofty::tag::Tag::new(file.primary_tag_type()));
    }
    let tag = file.primary_tag_mut().unwrap();
    tag.set_title("A new title".into());
    tag.set_artist("Guest artist".into());
    tag.set_album("Compilation".into());
    tag.insert_text(lofty::tag::ItemKey::AlbumArtist, "Various Artists".into());
    let mut art = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(8, 8)
        .write_to(&mut art, image::ImageFormat::Png)
        .unwrap();
    tag.push_picture(lofty::picture::Picture::new_unchecked(
        lofty::picture::PictureType::CoverFront,
        Some(lofty::picture::MimeType::Png),
        None,
        art.into_inner(),
    ));
    file.save_to_path(&path, lofty::config::WriteOptions::default())
        .unwrap();
    let bytes = fs::read(&path).unwrap();
    rescan(&db);
    let track = db.track(&id).unwrap();
    assert!(track.liked);
    assert_eq!(track.title, "A new title");
    let cover = track.cover.unwrap();
    assert!(Path::new(&cover).is_file());
    assert_eq!(image::open(cover).unwrap().width(), 8);
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(
        db.tracks(&TrackQuery {
            artist: Some("Various Artists".into()),
            limit: 200,
            ..Default::default()
        })
        .unwrap()
        .total,
        1
    );
    let mut decoder = rodio::Decoder::try_from(fs::File::open(path).unwrap()).unwrap();
    assert!(decoder.next().is_some());
    let _ = decoder.try_seek(std::time::Duration::from_millis(10));
}
