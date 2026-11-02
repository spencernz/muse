//! SSH/SFTP connection and read-only folder selection. No keys, shell commands or audio cross IPC.
use crate::db::{now, Db};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::Arc};

const PROFILE: &str = "providers.sftp.profile";
const HOSTS: &str = "providers.sftp.trusted_hosts";
pub const ENTRY_LIMIT: usize = 500;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidConfig,
    UnsafeAddress,
    Unreachable,
    Protocol,
    Authentication,
    KeyFile,
    HostKeyChanged,
    ConfirmationExpired,
    NotConnected,
    FolderUnavailable,
    PathOutsideRoot,
    Storage,
    Busy,
}
#[derive(Debug, Clone, Serialize)]
pub struct SftpError {
    pub code: ErrorCode,
    pub message: &'static str,
}
pub type Result<T> = std::result::Result<T, SftpError>;
pub fn error(code: ErrorCode) -> SftpError {
    use ErrorCode::*;
    SftpError { code, message: match code {
    InvalidConfig => "Enter a hostname, port, SSH username and an absolute remote folder path.",
    UnsafeAddress => "This address is not an allowed SSH destination.",
    Unreachable => "Could not reach the SSH server. Check the address, port and network, then retry.",
    Protocol => "The server did not provide a supported SSH/SFTP connection.",
    Authentication => "SSH key authentication failed. Check the username and that your friend installed your public key. Unlock encrypted keys in your SSH agent.",
    KeyFile => "Choose a readable private key file, not its .pub file. Restrict its permissions or unlock encrypted keys in your SSH agent.",
    HostKeyChanged => "The server key changed. Verify the new fingerprint with the server owner before resetting Muse's saved trust.",
    ConfirmationExpired => "This server verification is no longer current. Connect again to get a fresh fingerprint.",
    NotConnected => "Connect to the SSH server first.",
    FolderUnavailable => "This folder is unavailable or unreadable. Check the remote folder path and account permissions.",
    PathOutsideRoot => "Choose a folder inside the selected music folder. Traversal and links outside it are not allowed.",
    Storage => "Muse could not read or save its SSH connection settings. Check the app data folder and retry.",
    Busy => "An SSH operation is already running. Wait for it to finish.",
}}
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub root: String,
    pub identity_file: Option<String>,
}
impl Config {
    pub fn validate(mut self) -> Result<Self> {
        if self.port == 0
            || self.host.is_empty()
            || self.host.len() > 253
            || self
                .host
                .bytes()
                .any(|b| b.is_ascii_control() || b.is_ascii_whitespace())
            || self.host.contains(['/', '\\', '@', '?', '#', '%'])
        {
            return Err(error(ErrorCode::InvalidConfig));
        }
        self.host = if let Ok(ip) = self
            .host
            .trim_matches(['[', ']'])
            .parse::<std::net::IpAddr>()
        {
            ip.to_string()
        } else {
            match url::Host::parse(&self.host) {
                Ok(url::Host::Domain(host))
                    if host.split('.').all(|part| {
                        !part.is_empty()
                            && part.len() <= 63
                            && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                            && !part.starts_with('-')
                            && !part.ends_with('-')
                    }) =>
                {
                    host
                }
                Ok(url::Host::Ipv4(ip)) => ip.to_string(),
                Ok(url::Host::Ipv6(ip)) => ip.to_string(),
                _ => return Err(error(ErrorCode::InvalidConfig)),
            }
        };
        if self.username.is_empty()
            || self.username.len() > 128
            || self
                .username
                .bytes()
                .any(|b| b.is_ascii_control() || b.is_ascii_whitespace())
            || self.username.contains(['/', '\\', '@', ':'])
            || !self
                .username
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b'$'))
        {
            return Err(error(ErrorCode::InvalidConfig));
        }
        self.root = absolute_path(&self.root)?;
        if let Some(file) = &self.identity_file {
            if file.is_empty()
                || file.len() > 4096
                || !Path::new(file).is_absolute()
                || file.ends_with(".pub")
                || file.chars().any(char::is_control)
            {
                return Err(error(ErrorCode::KeyFile));
            }
        }
        Ok(self)
    }
    pub(super) fn endpoint(&self) -> String {
        format!("[{}]:{}", self.host, self.port)
    }
}
pub fn absolute_path(value: &str) -> Result<String> {
    if !value.starts_with('/')
        || value.len() > 4096
        || value.contains('\\')
        || value.chars().any(char::is_control)
        || value.split('/').any(|part| part == "..")
    {
        return Err(error(ErrorCode::PathOutsideRoot));
    }
    let parts: Vec<_> = value
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .collect();
    Ok(format!("/{}", parts.join("/")))
}
pub fn relative_path(value: &str) -> Result<String> {
    if value.starts_with('/')
        || value.len() > 4096
        || value.contains('\\')
        || value.chars().any(char::is_control)
        || value.split('/').any(|s| s == ".." || s == ".")
    {
        return Err(error(ErrorCode::PathOutsideRoot));
    }
    Ok(value.trim_end_matches('/').to_string())
}
pub(super) fn inside(root: &str, path: &str) -> bool {
    root == "/"
        || path == root
        || path
            .strip_prefix(root)
            .is_some_and(|suffix| suffix.starts_with('/'))
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostKey {
    pub algorithm: String,
    pub fingerprint: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Directory,
    File,
    Symlink,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    pub root: String,
    pub relative: String,
    pub parent: Option<String>,
    pub entries: Vec<RemoteEntry>,
    pub truncated: bool,
}
/// Testable I/O seam; implementations expose no remote writes, shell or forwarding operations.
pub trait ReadSeek: std::io::Read + std::io::Seek + Send + Sync {}
impl<T: std::io::Read + std::io::Seek + Send + Sync> ReadSeek for T {}
pub struct RemoteFile {
    pub reader: Box<dyn ReadSeek>,
    pub size: u64,
    pub modified: u64,
}
pub trait RemoteSession: Send {
    fn open(&mut self, _root: &str, _relative: &str) -> Result<RemoteFile> {
        Err(error(ErrorCode::Protocol))
    }
    fn host_key(&self) -> Result<HostKey>;
    fn authenticate(&mut self, config: &Config) -> Result<()>;
    fn canonical_directory(&mut self, path: &str) -> Result<String>;
    fn list(&mut self, path: &str, limit: usize) -> Result<(Vec<RemoteEntry>, bool)>;
}
pub trait Connector: Send + Sync {
    fn handshake(&self, config: &Config) -> Result<Box<dyn RemoteSession>>;
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostChallenge {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub key: HostKey,
    pub expires_at: i64,
}
struct Pending {
    challenge: HostChallenge,
    config: Config,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMismatch {
    pub host: String,
    pub port: u16,
    pub expected: HostKey,
    pub observed: HostKey,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Disconnected,
    Configured,
    Connected,
    Error,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpState {
    pub profile: Option<Config>,
    pub status: ConnectionStatus,
    pub listing: Option<FolderListing>,
    pub trusted_key: Option<HostKey>,
    pub key_mismatch: Option<KeyMismatch>,
}
#[derive(Serialize)]
pub struct ConnectResult {
    pub state: SftpState,
    pub challenge: Option<HostChallenge>,
}
struct Active {
    session: Box<dyn RemoteSession>,
    root: String,
}
pub struct SftpService {
    db: Db,
    connector: Arc<dyn Connector>,
    loaded: bool,
    profile: Option<Config>,
    active: Option<Active>,
    pending: Option<Pending>,
    listing: Option<FolderListing>,
    status: ConnectionStatus,
    mismatch: Option<KeyMismatch>,
}
impl SftpService {
    pub fn new(db: Db, connector: Arc<dyn Connector>) -> Self {
        Self {
            db,
            connector,
            loaded: false,
            profile: None,
            active: None,
            pending: None,
            listing: None,
            status: ConnectionStatus::Disconnected,
            mismatch: None,
        }
    }
    fn read<T: serde::de::DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let conn = self.db.connect().map_err(|_| error(ErrorCode::Storage))?;
        let value: Option<String> = conn
            .query_row("SELECT value FROM settings WHERE key=?", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|_| error(ErrorCode::Storage))?;
        value
            .map(|value| serde_json::from_str(&value).map_err(|_| error(ErrorCode::Storage)))
            .transpose()
    }
    fn load(&mut self) -> Result<()> {
        if !self.loaded {
            self.profile = self
                .read::<Option<Config>>(PROFILE)?
                .flatten()
                .map(Config::validate)
                .transpose()?;
            self.status = if self.profile.is_some() {
                ConnectionStatus::Configured
            } else {
                ConnectionStatus::Disconnected
            };
            self.loaded = true;
        }
        Ok(())
    }
    fn hosts(&self) -> Result<BTreeMap<String, HostKey>> {
        Ok(self.read(HOSTS)?.unwrap_or_default())
    }
    pub fn state(&mut self) -> Result<SftpState> {
        self.load()?;
        let hosts = self.hosts()?;
        Ok(SftpState {
            profile: self.profile.clone(),
            status: self.status,
            listing: self.listing.clone(),
            trusted_key: self
                .profile
                .as_ref()
                .and_then(|p| hosts.get(&p.endpoint()).cloned()),
            key_mismatch: self.mismatch.clone(),
        })
    }
    pub fn connect(&mut self, config: Config) -> Result<ConnectResult> {
        self.load()?;
        self.pending = None;
        self.mismatch = None;
        let config = config.validate()?;
        let mut session = self.connector.handshake(&config)?;
        let key = session.host_key()?;
        if let Some(expected) = self.hosts()?.get(&config.endpoint()) {
            if expected != &key {
                self.mismatch = Some(KeyMismatch {
                    host: config.host.clone(),
                    port: config.port,
                    expected: expected.clone(),
                    observed: key,
                });
                self.status = ConnectionStatus::Error;
                return Err(error(ErrorCode::HostKeyChanged));
            }
            self.establish(config, session.as_mut())?;
            self.active = Some(Active {
                root: self.profile.as_ref().unwrap().root.clone(),
                session,
            });
            return Ok(ConnectResult {
                state: self.state()?,
                challenge: None,
            });
        }
        let challenge = HostChallenge {
            id: uuid::Uuid::new_v4().to_string(),
            host: config.host.clone(),
            port: config.port,
            key,
            expires_at: now() + 300,
        };
        self.pending = Some(Pending {
            challenge: challenge.clone(),
            config,
        });
        // The unauthenticated probe session is dropped. Confirmation rechecks the fingerprint before any authentication.
        Ok(ConnectResult {
            state: self.state()?,
            challenge: Some(challenge),
        })
    }
    pub fn confirm_host(&mut self, id: &str) -> Result<SftpState> {
        let current = self
            .pending
            .as_ref()
            .filter(|p| p.challenge.id == id)
            .ok_or_else(|| error(ErrorCode::ConfirmationExpired))?;
        if current.challenge.expires_at <= now() {
            self.pending = None;
            return Err(error(ErrorCode::ConfirmationExpired));
        }
        let pending = self.pending.take().unwrap();
        let mut session = self.connector.handshake(&pending.config)?;
        let key = session.host_key()?;
        let mut hosts = self.hosts()?;
        if key != pending.challenge.key
            || hosts
                .get(&pending.config.endpoint())
                .is_some_and(|old| old != &key)
        {
            self.status = ConnectionStatus::Error;
            return Err(error(ErrorCode::HostKeyChanged));
        }
        // Save only the public server fingerprint, never the user's private key or passphrase.
        hosts.insert(pending.config.endpoint(), key);
        self.db
            .set_setting(HOSTS, &hosts)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.establish(pending.config, session.as_mut())?;
        self.active = Some(Active {
            root: self.profile.as_ref().unwrap().root.clone(),
            session,
        });
        self.state()
    }
    pub fn cancel_host(&mut self, id: &str) {
        if self.pending.as_ref().is_some_and(|p| p.challenge.id == id) {
            self.pending = None;
        }
    }
    fn establish(&mut self, mut config: Config, session: &mut dyn RemoteSession) -> Result<()> {
        session.authenticate(&config)?;
        let root = absolute_path(&session.canonical_directory(&config.root)?)?;
        config.root = root.clone();
        let listing = list_inside(session, &root, "")?;
        self.db
            .set_setting(PROFILE, &config)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.profile = Some(config);
        self.listing = Some(listing);
        self.status = ConnectionStatus::Connected;
        self.mismatch = None;
        Ok(())
    }
    pub fn browse(&mut self, relative: &str) -> Result<SftpState> {
        let active = self
            .active
            .as_mut()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        match list_inside(active.session.as_mut(), &active.root, relative) {
            Ok(listing) => {
                self.listing = Some(listing);
                self.status = ConnectionStatus::Connected;
                self.state()
            }
            Err(e) => {
                self.status = ConnectionStatus::Error;
                Err(e)
            }
        }
    }
    pub fn choose_folder(&mut self, relative: &str) -> Result<SftpState> {
        self.browse(relative)?;
        let listing = self.listing.as_mut().unwrap();
        let root = if listing.relative.is_empty() {
            listing.root.clone()
        } else {
            format!(
                "{}/{}",
                listing.root.trim_end_matches('/'),
                listing.relative
            )
        };
        let mut profile = self
            .profile
            .clone()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        profile.root = root.clone();
        self.db
            .set_setting(PROFILE, &profile)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.profile = Some(profile);
        self.active.as_mut().unwrap().root = root.clone();
        listing.root = root;
        listing.relative.clear();
        listing.parent = None;
        self.state()
    }
    pub fn reconnect(&mut self) -> Result<ConnectResult> {
        self.load()?;
        let profile = self
            .profile
            .clone()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        match self.connect(profile) {
            Ok(value) => Ok(value),
            Err(e) => {
                self.status = ConnectionStatus::Error;
                Err(e)
            }
        }
    }
    pub fn disconnect(&mut self) -> Result<SftpState> {
        self.db
            .set_setting(PROFILE, &Option::<Config>::None)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.active = None;
        self.pending = None;
        self.profile = None;
        self.listing = None;
        self.mismatch = None;
        self.loaded = true;
        self.status = ConnectionStatus::Disconnected;
        self.state()
    }
    pub fn forget_host(&mut self, host: String, port: u16, fingerprint: &str) -> Result<SftpState> {
        let normalized = Config {
            host,
            port,
            username: "trust-reset".into(),
            root: "/".into(),
            identity_file: None,
        }
        .validate()?;
        let mut hosts = self.hosts()?;
        if !hosts
            .get(&normalized.endpoint())
            .is_some_and(|key| key.fingerprint == fingerprint)
        {
            return Err(error(ErrorCode::ConfirmationExpired));
        }
        hosts.remove(&normalized.endpoint());
        self.db
            .set_setting(HOSTS, &hosts)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.pending = None;
        self.mismatch = None;
        if self
            .profile
            .as_ref()
            .is_some_and(|p| p.endpoint() == normalized.endpoint())
        {
            self.active = None;
            self.listing = None;
            self.status = ConnectionStatus::Configured;
        }
        self.state()
    }
}
fn list_inside(
    session: &mut dyn RemoteSession,
    root: &str,
    relative: &str,
) -> Result<FolderListing> {
    let relative = relative_path(relative)?;
    let requested = if relative.is_empty() {
        root.into()
    } else {
        format!("{}/{relative}", root.trim_end_matches('/'))
    };
    let canonical = absolute_path(&session.canonical_directory(&requested)?)?;
    if !inside(root, &canonical) {
        return Err(error(ErrorCode::PathOutsideRoot));
    }
    let (mut entries, truncated) = session.list(&canonical, ENTRY_LIMIT)?;
    if entries.len() > ENTRY_LIMIT {
        return Err(error(ErrorCode::Protocol));
    }
    for entry in &entries {
        if entry.name.is_empty()
            || entry.name.len() > 1024
            || entry.name.contains(['/', '\\'])
            || entry.name.chars().any(char::is_control)
            || matches!(entry.name.as_str(), "." | "..")
        {
            return Err(error(ErrorCode::Protocol));
        }
    }
    entries.retain(|e| {
        e.kind == EntryKind::Directory
            || e.kind == EntryKind::Symlink
            || crate::metadata::supported(Path::new(&e.name))
    });
    entries.sort_by(|a, b| {
        (a.kind != EntryKind::Directory)
            .cmp(&(b.kind != EntryKind::Directory))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then(a.name.cmp(&b.name))
    });
    let relative = canonical
        .strip_prefix(root)
        .unwrap_or(&canonical)
        .trim_start_matches('/')
        .to_string();
    let parent = if relative.is_empty() {
        None
    } else {
        Some(
            relative
                .rsplit_once('/')
                .map(|(parent, _)| parent)
                .unwrap_or("")
                .to_string(),
        )
    };
    Ok(FolderListing {
        root: root.into(),
        relative,
        parent,
        entries,
        truncated,
    })
}
