mod ai;
mod ai_playlists;
mod album_info;
mod analysis;
mod audio;
mod catalog;
pub mod db;
mod desktop;
mod lyrics;
#[cfg(target_os = "macos")]
mod mac_fullscreen;
mod metadata;
pub mod models;
mod music_profiles;
mod output;
mod playlist_art;
pub mod providers;
mod queue;
mod remote_audio;
pub mod scanner;

use audio::{Audio, PlayerRequest};
use db::{Db, Result};
use models::*;
use scanner::Scanner;
use serde::Serialize;
use tauri::{Emitter, Manager, State};

struct AppState {
    db: Db,
    audio: Audio,
    scanner: Scanner,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    library: Library,
    playback: Playback,
    scan: ScanProgress,
}

#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap> {
    let db = state.db.clone();
    let playback = state.audio.state.lock().map_err(|e| e.to_string())?.clone();
    let scan = state
        .scanner
        .progress
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(Bootstrap {
            library: db.library()?,
            playback,
            scan,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn library(state: State<'_, AppState>) -> Result<Library> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.library())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn tracks(query: TrackQuery, state: State<'_, AppState>) -> Result<TrackPage> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.tracks(&query))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn artist_album_ids(artist: String, state: State<'_, AppState>) -> Result<Vec<String>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn=db.connect()?;
        let mut query=conn.prepare("SELECT DISTINCT album_id FROM tracks WHERE artist=?1 OR album_artist=?1 ORDER BY album_id LIMIT 10000").map_err(|_|"Cannot load artist albums.")?;
        let rows=query.query_map([artist],|row|row.get(0)).map_err(|_|"Cannot load artist albums.")?;
        rows.collect::<std::result::Result<_,_>>().map_err(|_|"Cannot load artist albums.".into())
    }).await.map_err(|_|"Cannot load artist albums.")?
}
#[tauri::command]
async fn get_tracks(ids: Vec<String>, state: State<'_, AppState>) -> Result<Vec<Track>> {
    if ids.len() > 500 {
        return Err("Request up to 500 tracks at once.".into());
    }
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.get_tracks(&ids))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn add_folders(paths: Vec<String>, state: State<'_, AppState>) -> Result<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.add_sources(paths))
        .await
        .map_err(|e| e.to_string())??;
    state.scanner.request();
    Ok(())
}
#[tauri::command]
async fn query_track_ids(query: TrackQuery, state: State<'_, AppState>) -> Result<Vec<String>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.track_ids(&query))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_favourites(
    ids: Vec<String>,
    liked: bool,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<()> {
    if ids.len() > 100000 {
        return Err("Choose fewer tracks.".into());
    }
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.favourites(ids, liked))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app.emit("library-changed", ());
    Ok(())
}
#[tauri::command]
fn rescan(state: State<'_, AppState>) {
    state.scanner.request();
}
#[tauri::command]
fn stop_scan(state: State<'_, AppState>) {
    state.scanner.stop();
}
#[tauri::command]
async fn remove_folder(
    id: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<()> {
    if state
        .scanner
        .progress
        .lock()
        .map_err(|e| e.to_string())?
        .running
    {
        return Err("Stop indexing before removing a folder.".into());
    }
    let db = state.db.clone();
    let removed = tauri::async_runtime::spawn_blocking(move || db.remove_source(&id))
        .await
        .map_err(|e| e.to_string())??;
    let audio = state.audio.clone();
    tauri::async_runtime::spawn_blocking(move || {
        audio.command(PlayerRequest {
            action: "forget".into(),
            ids: removed,
            ..Default::default()
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    state.scanner.request();
    let _ = app.emit("library-changed", ());
    Ok(())
}
#[tauri::command]
async fn player(request: PlayerRequest, state: State<'_, AppState>) -> Result<Playback> {
    let audio = state.audio.clone();
    tauri::async_runtime::spawn_blocking(move || audio.command(request))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn favourite(
    id: String,
    liked: bool,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.favourite(&id, liked))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app.emit("library-changed", ());
    Ok(())
}
#[tauri::command]
async fn playlist(
    action: String,
    id: Option<String>,
    name: Option<String>,
    track_ids: Vec<String>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<String>> {
    if track_ids.len() > 100000 {
        return Err("Playlist is too large.".into());
    }
    let db = state.db.clone();
    let created = tauri::async_runtime::spawn_blocking(move || {
        db.playlist(&action, id.as_deref(), name.as_deref(), track_ids)
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit("library-changed", ());
    Ok(created)
}
#[tauri::command]
async fn save_tiles(tiles: Vec<Tile>, state: State<'_, AppState>) -> Result<()> {
    if tiles.len() > 64
        || tiles.iter().any(|t| {
            !["small", "wide", "medium"].contains(&t.size.as_str())
                || ![
                    "album",
                    "artist",
                    "recent",
                    "favourites",
                    "shuffle",
                    "playlists",
                    "added",
                    "collection",
                ]
                .contains(&t.kind.as_str())
        })
    {
        return Err("Invalid tile layout.".into());
    }
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.set_setting("tiles", &tiles))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(desktop::window_event)
        .setup(|app| {
            let db = Db::new(&app.path().app_data_dir()?).map_err(std::io::Error::other)?;
            app.manage(providers::commands::ProviderState::new(
                db.clone(),
                std::sync::Arc::new(providers::transport::HttpTransport),
                std::sync::Arc::new(providers::credentials::OsCredentialStore {
                    service: format!("{}.providers", app.config().identifier),
                }),
            ));
            app.manage(providers::sftp_commands::SftpBackend(std::sync::Arc::new(
                std::sync::Mutex::new(providers::sftp::SftpService::new(
                    db.clone(),
                    std::sync::Arc::new(providers::sftp_transport::SshConnector),
                )),
            )));
            app.manage(
                providers::remote::RemoteCatalog::new(
                    db.clone(),
                    std::sync::Arc::new(providers::sftp_transport::SshConnector),
                )
                .with_app(app.handle().clone()),
            );
            let ai = ai::AiConnection::new(
                db.clone(),
                std::sync::Arc::new(providers::credentials::OsCredentialStore {
                    service: format!("{}.providers", app.config().identifier),
                }),
                std::sync::Arc::new(ai::HttpAiWire),
            );
            app.manage(album_info::AlbumInfo::new(
                db.clone(),
                ai.clone(),
                std::sync::Arc::new(album_info::MusicBrainzCatalog::default()),
            ));
            app.manage(ai_playlists::AiPlaylists::new(db.clone()));
            app.manage(
                music_profiles::MusicProfiles::new(db.clone()).with_app(app.handle().clone()),
            );
            app.manage(ai);
            let audio = Audio::start(db.clone(), app.handle().clone());
            let scanner = Scanner::start(db.clone(), app.handle().clone());
            app.manage(AppState { db, audio, scanner });
            desktop::setup(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            analysis::visualizer_active,
            analysis::visualizer_frame,
            lyrics::track_lyrics,
            lyrics::import_track_lyrics,
            ai::ai_settings,
            ai::save_ai_settings,
            ai::remove_ai_key,
            ai::test_ai_connection,
            ai_playlists::generate_ai_playlist,
            ai_playlists::start_ai_dj,
            music_profiles::music_analysis_status,
            music_profiles::music_analysis_start,
            music_profiles::music_analysis_cancel,
            music_profiles::music_analysis_background,
            music_profiles::music_analysis_review,
            music_profiles::music_analysis_correct,
            album_info::search_album_info,
            album_info::discard_album_preview,
            album_info::apply_album_info,
            library,
            tracks,
            get_tracks,
            artist_album_ids,
            query_track_ids,
            set_favourites,
            add_folders,
            rescan,
            stop_scan,
            remove_folder,
            player,
            output::audio_outputs,
            output::select_audio_output,
            output::open_sound_settings,
            favourite,
            playlist,
            playlist_art::playlist_covers,
            save_tiles,
            desktop::window_fullscreen,
            desktop::exit_fullscreen,
            desktop::enter_fullscreen,
            desktop::show_main_window,
            desktop::hide_mini_player,
            desktop::preferences,
            desktop::set_close_behavior,
            providers::commands::music_providers,
            providers::commands::plex_state,
            providers::commands::plex_begin_auth,
            providers::commands::plex_open_auth,
            providers::commands::plex_poll_auth,
            providers::commands::plex_cancel_auth,
            providers::commands::plex_discover,
            providers::commands::plex_select_server,
            providers::commands::plex_manual,
            providers::commands::plex_select_library,
            providers::commands::plex_test,
            providers::commands::plex_reconnect,
            providers::commands::plex_verify_metadata,
            providers::commands::plex_disconnect,
            providers::remote::sftp_sync_status,
            providers::remote::sftp_auto_sync,
            providers::remote::sftp_auto_sync_save,
            providers::remote::sftp_sync_start,
            providers::remote::sftp_sync_cancel,
            providers::sftp_commands::sftp_state,
            providers::sftp_commands::sftp_connect,
            providers::sftp_commands::sftp_confirm_host,
            providers::sftp_commands::sftp_cancel_host,
            providers::sftp_commands::sftp_browse,
            providers::sftp_commands::sftp_choose_folder,
            providers::sftp_commands::sftp_reconnect,
            providers::sftp_commands::sftp_disconnect,
            providers::sftp_commands::sftp_forget_host
        ])
        .build(tauri::generate_context!())
        .expect("Muse could not start")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { .. } => desktop::save_playback(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => desktop::show(app),
            _ => {}
        });
}
