PRAGMA user_version=3;
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,available INTEGER NOT NULL DEFAULT 1,last_scan INTEGER NOT NULL DEFAULT 0,error TEXT);
CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,album TEXT NOT NULL,album_artist TEXT NOT NULL,album_id TEXT NOT NULL,year INTEGER,genre TEXT NOT NULL,duration REAL NOT NULL,track_no INTEGER NOT NULL,disc_no INTEGER NOT NULL,cover TEXT,liked INTEGER NOT NULL DEFAULT 0,added_at INTEGER NOT NULL,last_played INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS locations(path TEXT PRIMARY KEY,track_id TEXT NOT NULL REFERENCES tracks(id),source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,size INTEGER NOT NULL,modified TEXT NOT NULL,hash TEXT NOT NULL,present INTEGER NOT NULL DEFAULT 1,generation TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS locations_hash ON locations(hash);
CREATE INDEX IF NOT EXISTS locations_track ON locations(track_id,present);
CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_id,disc_no,track_no);
CREATE INDEX IF NOT EXISTS tracks_artist ON tracks(artist COLLATE NOCASE,title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS tracks_title ON tracks(title COLLATE NOCASE,id);
CREATE INDEX IF NOT EXISTS tracks_added ON tracks(added_at DESC);
CREATE INDEX IF NOT EXISTS tracks_year ON tracks(year DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS track_search USING fts5(title,artist,album,genre,content=tracks,content_rowid=rowid,tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS track_insert AFTER INSERT ON tracks BEGIN INSERT INTO track_search(rowid,title,artist,album,genre) VALUES(new.rowid,new.title,new.artist,new.album,new.genre); END;
CREATE TRIGGER IF NOT EXISTS track_delete AFTER DELETE ON tracks BEGIN INSERT INTO track_search(track_search,rowid,title,artist,album,genre) VALUES('delete',old.rowid,old.title,old.artist,old.album,old.genre); END;
CREATE TRIGGER IF NOT EXISTS track_update AFTER UPDATE OF title,artist,album,genre ON tracks BEGIN INSERT INTO track_search(track_search,rowid,title,artist,album,genre) VALUES('delete',old.rowid,old.title,old.artist,old.album,old.genre); INSERT INTO track_search(rowid,title,artist,album,genre) VALUES(new.rowid,new.title,new.artist,new.album,new.genre); END;
CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id),position INTEGER NOT NULL,PRIMARY KEY(playlist_id,track_id));
CREATE INDEX IF NOT EXISTS playlist_order ON playlist_tracks(playlist_id,position);
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,track_id TEXT NOT NULL REFERENCES tracks(id),played_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS history_track ON history(track_id,played_at DESC);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scan_issues(path TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,error TEXT NOT NULL,generation TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS remote_sources(id TEXT PRIMARY KEY,profile TEXT NOT NULL,last_sync INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS remote_locations(track_id TEXT PRIMARY KEY REFERENCES tracks(id),source_id TEXT NOT NULL REFERENCES remote_sources(id),relative TEXT NOT NULL,size INTEGER NOT NULL,modified INTEGER NOT NULL,present INTEGER NOT NULL DEFAULT 1,UNIQUE(source_id,relative));
CREATE INDEX IF NOT EXISTS remote_source ON remote_locations(source_id,present);

CREATE TABLE IF NOT EXISTS remote_file_ids(endpoint TEXT NOT NULL,path TEXT NOT NULL,track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,PRIMARY KEY(endpoint,path));
CREATE TABLE IF NOT EXISTS album_overrides(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,year INTEGER,genre TEXT NOT NULL,cover TEXT,release_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS track_album_overrides(track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,album_id TEXT NOT NULL REFERENCES album_overrides(id) ON UPDATE CASCADE);

-- Versioned local audio profiles; additive and backwards compatible with catalog v3.
CREATE TABLE IF NOT EXISTS music_profiles(track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,model_version TEXT NOT NULL,profile TEXT NOT NULL,analysed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS music_mood_overrides(track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,mood TEXT NOT NULL,include_track INTEGER NOT NULL CHECK(include_track IN (0,1)),PRIMARY KEY(track_id,mood));
