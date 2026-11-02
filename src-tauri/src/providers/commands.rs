use super::{
    error,
    plex::{AuthPoll, AuthStart, PlexService, PlexState, Verification},
    ErrorCode, Result,
};
use std::sync::{Arc, Mutex};
use tauri::State;

/// Constructing the provider registry does no vault, network or settings I/O.
/// A Plex initialization failure is returned only to Plex commands, never app setup.
#[derive(Clone)]
pub struct ProviderState {
    session: Arc<Mutex<Option<PlexService>>>,
    db: crate::db::Db,
    transport: Arc<dyn super::transport::Transport>,
    vault: Arc<dyn super::credentials::CredentialStore>,
}
impl ProviderState {
    pub fn new(
        db: crate::db::Db,
        transport: Arc<dyn super::transport::Transport>,
        vault: Arc<dyn super::credentials::CredentialStore>,
    ) -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            db,
            transport,
            vault,
        }
    }
    fn access<T>(
        &self,
        wait: bool,
        action: impl FnOnce(&mut PlexService) -> Result<T>,
    ) -> Result<T> {
        let mut session = if wait {
            self.session.lock().map_err(|_| error(ErrorCode::Busy))?
        } else {
            self.session
                .try_lock()
                .map_err(|_| error(ErrorCode::Busy))?
        };
        if session.is_none() {
            *session = Some(PlexService::new(
                self.db.clone(),
                self.transport.clone(),
                self.vault.clone(),
            )?);
        }
        action(session.as_mut().unwrap())
    }
}
async fn run<T: Send + 'static>(
    state: State<'_, ProviderState>,
    action: impl FnOnce(&mut PlexService) -> Result<T> + Send + 'static,
) -> Result<T> {
    let provider = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || provider.access(false, action))
        .await
        .map_err(|_| error(ErrorCode::Unreachable))?
}
async fn run_wait<T: Send + 'static>(
    state: State<'_, ProviderState>,
    action: impl FnOnce(&mut PlexService) -> Result<T> + Send + 'static,
) -> Result<T> {
    let provider = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || provider.access(true, action))
        .await
        .map_err(|_| error(ErrorCode::Unreachable))?
}
#[tauri::command]
pub fn music_providers() -> Vec<super::ProviderDescriptor> {
    super::descriptors()
}
#[tauri::command]
pub async fn plex_state(state: State<'_, ProviderState>) -> Result<PlexState> {
    run_wait(state, |s| s.state()).await
}
#[tauri::command]
pub async fn plex_begin_auth(state: State<'_, ProviderState>) -> Result<AuthStart> {
    run(state, |s| s.begin_auth()).await
}
#[tauri::command]
pub async fn plex_open_auth(id: u64, state: State<'_, ProviderState>) -> Result<()> {
    run(state, move |s| {
        open::that_detached(s.auth_url(id)?).map_err(|_| error(ErrorCode::Browser))
    })
    .await
}
#[tauri::command]
pub async fn plex_poll_auth(id: u64, state: State<'_, ProviderState>) -> Result<AuthPoll> {
    run(state, move |s| s.poll_auth(id)).await
}
#[tauri::command]
pub async fn plex_cancel_auth(id: u64, state: State<'_, ProviderState>) -> Result<()> {
    run_wait(state, move |s| {
        s.cancel_auth(id);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn plex_discover(state: State<'_, ProviderState>) -> Result<PlexState> {
    run(state, |s| s.discover()).await
}
#[tauri::command]
pub async fn plex_select_server(
    id: String,
    allow_local_http: bool,
    state: State<'_, ProviderState>,
) -> Result<PlexState> {
    run(state, move |s| s.select_server(&id, allow_local_http)).await
}
#[tauri::command]
pub async fn plex_manual(
    url: String,
    token: String,
    allow_local_http: bool,
    state: State<'_, ProviderState>,
) -> Result<PlexState> {
    run(state, move |s| s.manual(&url, &token, allow_local_http)).await
}
#[tauri::command]
pub async fn plex_select_library(id: String, state: State<'_, ProviderState>) -> Result<PlexState> {
    run(state, move |s| s.select_library(&id)).await
}
#[tauri::command]
pub async fn plex_test(state: State<'_, ProviderState>) -> Result<PlexState> {
    run(state, |s| s.test()).await
}
#[tauri::command]
pub async fn plex_reconnect(state: State<'_, ProviderState>) -> Result<PlexState> {
    run(state, |s| s.reconnect()).await
}
#[tauri::command]
pub async fn plex_verify_metadata(state: State<'_, ProviderState>) -> Result<Verification> {
    run(state, |s| s.verify_metadata()).await
}
#[tauri::command]
pub async fn plex_disconnect(state: State<'_, ProviderState>) -> Result<PlexState> {
    run(state, |s| s.disconnect()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    struct LockedVault;
    impl super::super::credentials::CredentialStore for LockedVault {
        fn get(&self, _: &str) -> Result<Option<String>> {
            Err(error(ErrorCode::CredentialStore))
        }
        fn set(&self, _: &str, _: &str) -> Result<()> {
            Err(error(ErrorCode::CredentialStore))
        }
        fn delete(&self, _: &str) -> Result<()> {
            Err(error(ErrorCode::CredentialStore))
        }
    }
    #[test]
    fn provider_initialization_is_lazy_and_locked_credentials_do_not_affect_local_music() {
        let root = tempfile::TempDir::new().unwrap();
        let db = crate::db::Db::new(root.path()).unwrap();
        let state = ProviderState::new(
            db.clone(),
            Arc::new(super::super::transport::HttpTransport),
            Arc::new(LockedVault),
        );
        assert!(db.setting::<String>("providers.client_id").is_none());
        assert!(state.session.lock().unwrap().is_none());
        assert_eq!(
            state.access(true, |s| s.state()).err().unwrap().code,
            ErrorCode::CredentialStore
        );
        assert_eq!(db.library().unwrap().tracks, 0);
        assert!(db
            .setting::<serde_json::Value>("providers.plex.selection")
            .is_none());
    }
}
