use crate::db::{Db, Result};
use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::{Accessor, ItemKey},
};
use rodio::Source;
use std::{
    fs::File,
    io::{BufReader, Cursor},
    path::Path,
};

pub struct Metadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<i32>,
    pub genre: String,
    pub duration: f64,
    pub track_no: u32,
    pub disc_no: u32,
    pub cover: Option<String>,
    pub album_id: String,
}

pub fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| {
            matches!(
                s.to_ascii_lowercase().as_str(),
                "mp3"
                    | "flac"
                    | "wav"
                    | "m4a"
                    | "mp4"
                    | "aac"
                    | "alac"
                    | "ogg"
                    | "opus"
                    | "aiff"
                    | "aif"
            )
        })
        .unwrap_or(false)
}

pub fn read(path: &Path, db: &Db) -> Result<Metadata> {
    match lofty::read_from_path(path) {
        Ok(file) => map_tags(file, path, db),
        Err(e) => {
            // Raw AAC may have no tag container. Validate with the existing decoder.
            let decoder = File::open(path)
                .map_err(|e| e.to_string())
                .and_then(|f| rodio::Decoder::try_from(f).map_err(|_| e.to_string()))?;
            let mut m = defaults(path);
            m.duration = decoder
                .total_duration()
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.);
            Ok(finish(m))
        }
    }
}
fn defaults(path: &Path) -> Metadata {
    let title = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let album = path
        .parent()
        .and_then(|p| p.file_name())
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    Metadata {
        title,
        artist: "Unknown artist".into(),
        album,
        album_artist: String::new(),
        year: None,
        genre: String::new(),
        duration: 0.,
        track_no: 0,
        disc_no: 1,
        cover: None,
        album_id: String::new(),
    }
}
fn finish(mut m: Metadata) -> Metadata {
    if m.album.is_empty() {
        m.album = "Unknown album".into();
    }
    if m.album_artist.is_empty() {
        m.album_artist = m.artist.clone();
    }
    m.album_id = blake3::hash(
        format!(
            "{}\0{}\0{:?}",
            m.album_artist.to_lowercase(),
            m.album.to_lowercase(),
            m.year
        )
        .as_bytes(),
    )
    .to_hex()
    .to_string();
    m
}
fn map_tags(file: lofty::file::TaggedFile, path: &Path, db: &Db) -> Result<Metadata> {
    let mut m = defaults(path);
    m.duration = file.properties().duration().as_secs_f64();
    if let Some(tag) = file.primary_tag().or_else(|| file.first_tag()) {
        if let Some(s) = tag.title().filter(|s| !s.trim().is_empty()) {
            m.title = s.trim().into();
        }
        if let Some(s) = tag.artist().filter(|s| !s.trim().is_empty()) {
            m.artist = s.trim().into();
        }
        if let Some(s) = tag.album().filter(|s| !s.trim().is_empty()) {
            m.album = s.trim().into();
        }
        m.album_artist = tag
            .get_string(&ItemKey::AlbumArtist)
            .unwrap_or(&m.artist)
            .trim()
            .into();
        m.genre = tag.genre().map(|s| s.into_owned()).unwrap_or_default();
        m.year = tag.year().map(|n| n as i32);
        m.track_no = tag.track().unwrap_or(0);
        m.disc_no = tag.disk().unwrap_or(1);
        let pic = tag
            .pictures()
            .iter()
            .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
            .or_else(|| tag.pictures().first());
        if let Some(picture) = pic {
            m.cover = cache_cover(picture.data(), db).ok();
        }
    }
    Ok(finish(m))
}

pub(crate) fn cache_cover(data: &[u8], db: &Db) -> Result<String> {
    if data.len() > 32 * 1024 * 1024 {
        return Err("Artwork is larger than the cache limit.".into());
    }
    let target = db
        .artwork
        .join(format!("{}.jpg", blake3::hash(data).to_hex()));
    if !target.exists() {
        let mut reader = image::ImageReader::new(Cursor::new(data))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(12000);
        limits.max_image_height = Some(12000);
        limits.max_alloc = Some(128 * 1024 * 1024);
        reader.limits(limits);
        let image = reader.decode().map_err(|e| e.to_string())?;
        let image = if image.width() > 600 || image.height() > 600 {
            image.thumbnail(600, 600)
        } else {
            image
        }
        .to_rgb8();
        let temp = target.with_extension("tmp");
        image::DynamicImage::ImageRgb8(image)
            .save_with_format(&temp, image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        std::fs::rename(temp, &target).map_err(|e| e.to_string())?;
    }
    Ok(target.to_string_lossy().to_string())
}

pub fn hash(path: &Path) -> Result<String> {
    let mut reader = BufReader::new(File::open(path).map_err(|e| e.to_string())?);
    let mut h = blake3::Hasher::new();
    h.update_reader(&mut reader).map_err(|e| e.to_string())?;
    Ok(h.finalize().to_hex().to_string())
}

/// Read tags with the same mapping as local files; the caller bounds network reads.
pub fn read_remote<R: std::io::Read + std::io::Seek + Send + Sync + 'static>(
    mut reader: R,
    path: &Path,
    db: &Db,
) -> Result<Metadata> {
    let tagged = lofty::probe::Probe::new(&mut reader)
        .guess_file_type()
        .map_err(|_| ())
        .and_then(|p| p.read().map_err(|_| ()));
    match tagged {
        Ok(file) => map_tags(file, path, db),
        Err(_)
            if path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("aac")) =>
        {
            reader
                .rewind()
                .map_err(|_| "Cannot read remote audio tags.")?;
            let decoder = rodio::Decoder::new(BufReader::new(reader))
                .map_err(|_| "Cannot decode remote AAC audio.")?;
            let mut m = defaults(path);
            m.duration = decoder
                .total_duration()
                .map(|d| d.as_secs_f64())
                .unwrap_or(0.);
            Ok(finish(m))
        }
        Err(_) => Err("Cannot read remote audio tags.".into()),
    }
}
