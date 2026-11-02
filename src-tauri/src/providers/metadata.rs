use super::{error, ArtworkRef, ErrorCode, MediaKind, MetadataItem, MetadataPage, Result};
use crate::models::{Album, Facet, Track};
use serde_json::Value;

pub fn identifier(value: &str) -> Result<&str> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        Err(error(ErrorCode::InvalidResponse))
    } else {
        Ok(value)
    }
}
pub fn numeric(value: &str) -> Result<&str> {
    if value.is_empty() || value.len() > 32 || !value.bytes().all(|b| b.is_ascii_digit()) {
        Err(error(ErrorCode::InvalidResponse))
    } else {
        Ok(value)
    }
}
fn text<'a>(value: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(fallback)
}
pub fn key(value: &Value, field: &str) -> Result<String> {
    let key = match value.get(field) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => return Err(error(ErrorCode::InvalidResponse)),
    };
    numeric(&key)?;
    Ok(key)
}
fn namespace(server: &str, key: &str) -> String {
    format!("plex:{server}:{key}")
}
fn artwork(value: &Value, server: &str) -> Option<ArtworkRef> {
    ["thumb", "parentThumb", "grandparentThumb"]
        .iter()
        .find_map(|field| {
            let path = value.get(field)?.as_str()?;
            // Opaque same-server metadata references only. Never pass remote URLs or query tokens to the UI.
            let parts: Vec<_> = path.split('/').collect();
            if (parts.len() == 5 || parts.len() == 6)
                && parts[0].is_empty()
                && parts[1] == "library"
                && parts[2] == "metadata"
                && numeric(parts[3]).is_ok()
                && matches!(parts[4], "thumb" | "art")
                && (parts.len() == 5 || numeric(parts[5]).is_ok())
            {
                Some(ArtworkRef::Plex {
                    server_id: server.into(),
                    key: path.into(),
                })
            } else {
                None
            }
        })
}
fn genre(value: &Value) -> String {
    value
        .get("Genre")
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .and_then(|v| v.get("tag"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .into()
}
fn number(value: &Value, field: &str) -> u64 {
    value.get(field).and_then(Value::as_u64).unwrap_or(0)
}
fn year(value: &Value) -> Option<i32> {
    value
        .get("year")
        .and_then(Value::as_i64)
        .and_then(|v| i32::try_from(v).ok())
}

pub fn normalize(
    response: Value,
    server: &str,
    kind: MediaKind,
    offset: usize,
    limit: usize,
) -> Result<MetadataPage> {
    identifier(server)?;
    let container = response
        .get("MediaContainer")
        .filter(|v| v.is_object())
        .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
    if container
        .get("offset")
        .and_then(Value::as_u64)
        .is_some_and(|n| n != offset as u64)
    {
        return Err(error(ErrorCode::InvalidResponse));
    }
    let empty = Vec::new();
    let rows = match container.get("Metadata") {
        Some(value) => value
            .as_array()
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?,
        None if number(container, "size") == 0 => &empty,
        None => return Err(error(ErrorCode::InvalidResponse)),
    };
    if rows.len() > limit {
        return Err(error(ErrorCode::ResponseTooLarge));
    }
    let total = container
        .get("totalSize")
        .and_then(Value::as_u64)
        .unwrap_or(offset as u64 + rows.len() as u64) as usize;
    let mut items = Vec::new();
    for row in rows {
        let expected = match kind {
            MediaKind::Artist => "artist",
            MediaKind::Album => "album",
            MediaKind::Track => "track",
        };
        if row.get("type").and_then(Value::as_str) != Some(expected) {
            return Err(error(ErrorCode::InvalidResponse));
        }
        let remote = key(row, "ratingKey")?;
        let id = namespace(server, &remote);
        let art = artwork(row, server);
        // Covers remain None in local-compatible DTOs: remote art has an explicit provider reference.
        let item = match kind {
            MediaKind::Artist => MetadataItem::Artist {
                id,
                artist: Facet {
                    name: text(row, "title", "Unknown artist").into(),
                    tracks: number(row, "leafCount") as usize,
                    cover: None,
                },
                artwork: art,
            },
            MediaKind::Album => MetadataItem::Album {
                album: Album {
                    id,
                    title: text(row, "title", "Unknown album").into(),
                    artist: text(row, "parentTitle", "Unknown artist").into(),
                    year: year(row),
                    genre: genre(row),
                    cover: None,
                    duration: number(row, "duration") as f64 / 1000.,
                    tracks: number(row, "leafCount") as usize,
                    added_at: number(row, "addedAt") as i64,
                    last_played: number(row, "lastViewedAt") as i64,
                },
                artwork: art,
            },
            MediaKind::Track => MetadataItem::Track {
                track: Track {
                    id,
                    title: text(row, "title", "Untitled track").into(),
                    artist: text(
                        row,
                        "originalTitle",
                        text(row, "grandparentTitle", "Unknown artist"),
                    )
                    .into(),
                    album: text(row, "parentTitle", "Unknown album").into(),
                    album_artist: text(row, "grandparentTitle", "Unknown artist").into(),
                    album_id: namespace(server, &key(row, "parentRatingKey")?),
                    year: year(row),
                    genre: genre(row),
                    cover: None,
                    duration: number(row, "duration") as f64 / 1000.,
                    track_no: number(row, "index").min(u32::MAX as u64) as u32,
                    disc_no: number(row, "parentIndex").min(u32::MAX as u64) as u32,
                    liked: row
                        .get("userRating")
                        .and_then(Value::as_f64)
                        .is_some_and(|v| v >= 8.),
                    available: true,
                    added_at: number(row, "addedAt") as i64,
                },
                artwork: art,
            },
        };
        items.push(item);
    }
    Ok(MetadataPage {
        provider_id: "plex",
        offset,
        total,
        items,
    })
}
