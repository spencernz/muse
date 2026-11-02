use super::sftp::{error, Config, ConnectResult, ErrorCode, Result, SftpService, SftpState};
use std::sync::{Arc, Mutex};
use tauri::State;
#[derive(Clone)]
pub struct SftpBackend(pub Arc<Mutex<SftpService>>);
async fn run<T: Send + 'static>(
    state: State<'_, SftpBackend>,
    wait: bool,
    action: impl FnOnce(&mut SftpService) -> Result<T> + Send + 'static,
) -> Result<T> {
    let backend = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = if wait {
            backend.lock().map_err(|_| error(ErrorCode::Busy))?
        } else {
            backend.try_lock().map_err(|_| error(ErrorCode::Busy))?
        };
        action(&mut guard)
    })
    .await
    .map_err(|_| error(ErrorCode::Unreachable))?
}
#[tauri::command]
pub async fn sftp_state(state: State<'_, SftpBackend>) -> Result<SftpState> {
    run(state, true, |s| s.state()).await
}
#[tauri::command]
pub async fn sftp_connect(config: Config, state: State<'_, SftpBackend>) -> Result<ConnectResult> {
    run(state, false, move |s| s.connect(config)).await
}
#[tauri::command]
pub async fn sftp_confirm_host(id: String, state: State<'_, SftpBackend>) -> Result<SftpState> {
    run(state, false, move |s| s.confirm_host(&id)).await
}
#[tauri::command]
pub async fn sftp_cancel_host(id: String, state: State<'_, SftpBackend>) -> Result<()> {
    run(state, true, move |s| {
        s.cancel_host(&id);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn sftp_browse(relative: String, state: State<'_, SftpBackend>) -> Result<SftpState> {
    run(state, false, move |s| s.browse(&relative)).await
}
#[tauri::command]
pub async fn sftp_choose_folder(
    relative: String,
    state: State<'_, SftpBackend>,
) -> Result<SftpState> {
    run(state, false, move |s| s.choose_folder(&relative)).await
}
#[tauri::command]
pub async fn sftp_reconnect(state: State<'_, SftpBackend>) -> Result<ConnectResult> {
    run(state, false, |s| s.reconnect()).await
}
#[tauri::command]
pub async fn sftp_disconnect(state: State<'_, SftpBackend>) -> Result<SftpState> {
    run(state, false, |s| s.disconnect()).await
}
#[tauri::command]
pub async fn sftp_forget_host(
    host: String,
    port: u16,
    fingerprint: String,
    state: State<'_, SftpBackend>,
) -> Result<SftpState> {
    run(state, false, move |s| {
        s.forget_host(host, port, &fingerprint)
    })
    .await
}
