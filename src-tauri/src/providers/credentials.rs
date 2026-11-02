use super::{error, ErrorCode, Result};

pub trait CredentialStore: Send + Sync {
    fn get(&self, slot: &str) -> Result<Option<String>>;
    fn set(&self, slot: &str, value: &str) -> Result<()>;
    fn delete(&self, slot: &str) -> Result<()>;
}
/// The service name includes the app identifier so isolated QA apps never share real credentials.
pub struct OsCredentialStore {
    pub service: String,
}
impl OsCredentialStore {
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn entry(&self, slot: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(&self.service, slot).map_err(|_| error(ErrorCode::CredentialStore))
    }
}
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
impl CredentialStore for OsCredentialStore {
    fn get(&self, slot: &str) -> Result<Option<String>> {
        match self.entry(slot)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(error(ErrorCode::CredentialStore)),
        }
    }
    fn set(&self, slot: &str, value: &str) -> Result<()> {
        self.entry(slot)?
            .set_password(value)
            .map_err(|_| error(ErrorCode::CredentialStore))
    }
    fn delete(&self, slot: &str) -> Result<()> {
        match self.entry(slot)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(error(ErrorCode::CredentialStore)),
        }
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
impl CredentialStore for OsCredentialStore {
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
