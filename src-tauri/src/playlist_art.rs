use crate::db::{Db, Result};
pub fn covers(db: &Db, id: Option<&str>) -> Result<Vec<String>> {
    let conn = db.connect()?;
    let mut query = conn.prepare("SELECT DISTINCT coalesce(t.cover,a.cover) AS art FROM tracks t LEFT JOIN (SELECT album_id,max(cover) AS cover FROM tracks WHERE cover IS NOT NULL AND cover<>'' GROUP BY album_id) a ON a.album_id=t.album_id WHERE ((?1 IS NULL AND t.liked=1) OR EXISTS (SELECT 1 FROM playlist_tracks p WHERE p.track_id=t.id AND p.playlist_id=?1)) AND coalesce(t.cover,a.cover) IS NOT NULL AND coalesce(t.cover,a.cover)<>'' ORDER BY random() LIMIT 50").map_err(|_|"Cannot read playlist artwork.")?;
    let rows = query
        .query_map([id], |row| row.get(0))
        .map_err(|_| "Cannot read playlist artwork.")?;
    rows.collect::<std::result::Result<_, _>>()
        .map_err(|_| "Cannot read playlist artwork.".into())
}
#[tauri::command]
pub async fn playlist_covers(
    id: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<String>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || covers(&db, id.as_deref()))
        .await
        .map_err(|_| "Cannot load playlist artwork.")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_returns_distinct_member_or_favourite_covers_with_album_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::new(dir.path()).unwrap();
        let conn = db.connect().unwrap();
        conn.execute("INSERT INTO playlists VALUES('mix','Mix')", [])
            .unwrap();
        for (id, album, cover, liked) in [
            ("one", "album", Some("cover-a"), 1),
            ("two", "album", None, 0),
            ("three", "other", Some("cover-b"), 0),
        ] {
            conn.execute("INSERT INTO tracks(id,title,artist,album,album_artist,album_id,genre,duration,track_no,disc_no,cover,liked,added_at) VALUES (?1,'Song','Artist','Album','Artist',?2,'',1,1,1,?3,?4,1)",rusqlite::params![id,album,cover,liked]).unwrap();
        }
        conn.execute("INSERT INTO playlist_tracks VALUES('mix','two',0)", [])
            .unwrap();
        conn.execute("INSERT INTO playlist_tracks VALUES('mix','one',1)", [])
            .unwrap();
        assert_eq!(covers(&db, Some("mix")).unwrap(), vec!["cover-a"]);
        assert_eq!(covers(&db, None).unwrap(), vec!["cover-a"]);
        assert!(covers(&db, Some("missing")).unwrap().is_empty());
    }
}
