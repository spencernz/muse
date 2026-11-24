use muse_lib::{
    db::Db,
    providers::{self, sftp::*, sftp_transport::allowed_ip},
};
use providers::credentials::CredentialStore;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tempfile::TempDir;

fn config() -> Config {
    Config {
        host: "music.example.test".into(),
        port: 2222,
        username: "listener".into(),
        root: "/media/Music".into(),
        identity_file: None,
        password_auth: false,
        password: None,
    }
}
fn key(number: u8) -> HostKey {
    HostKey {
        algorithm: "ssh-ed25519".into(),
        fingerprint: format!("SHA256:synthetic-{number}"),
    }
}
#[derive(Clone)]
struct Scenario {
    key: HostKey,
    auth_error: bool,
    network_error: bool,
    roots: HashMap<String, String>,
    entries: Vec<RemoteEntry>,
    truncated: bool,
}
struct FakeConnector {
    scenario: Arc<Mutex<Scenario>>,
    authenticated: Arc<AtomicUsize>,
    handshakes: AtomicUsize,
    passwords: Arc<Mutex<Vec<String>>>,
}
impl FakeConnector {
    fn new() -> Self {
        Self {
            scenario: Arc::new(Mutex::new(Scenario {
                key: key(1),
                auth_error: false,
                network_error: false,
                roots: HashMap::new(),
                entries: vec![
                    RemoteEntry {
                        name: "Album".into(),
                        kind: EntryKind::Directory,
                        size: None,
                        modified: None,
                    },
                    RemoteEntry {
                        name: "Song.FLAC".into(),
                        kind: EntryKind::File,
                        size: Some(12345),
                        modified: None,
                    },
                    RemoteEntry {
                        name: "notes.txt".into(),
                        kind: EntryKind::File,
                        size: Some(1),
                        modified: None,
                    },
                ],
                truncated: false,
            })),
            authenticated: Arc::new(AtomicUsize::new(0)),
            handshakes: AtomicUsize::new(0),
            passwords: Arc::new(Mutex::new(Vec::new())),
        }
    }
}
struct FakeSession {
    scenario: Scenario,
    authenticated: Arc<AtomicUsize>,
    passwords: Arc<Mutex<Vec<String>>>,
}
impl Connector for FakeConnector {
    fn handshake(&self, _: &Config) -> Result<Box<dyn RemoteSession>> {
        self.handshakes.fetch_add(1, Ordering::SeqCst);
        let scenario = self.scenario.lock().unwrap().clone();
        if scenario.network_error {
            return Err(error(ErrorCode::Unreachable));
        }
        Ok(Box::new(FakeSession {
            scenario,
            authenticated: self.authenticated.clone(),
            passwords: self.passwords.clone(),
        }))
    }
}
impl RemoteSession for FakeSession {
    fn host_key(&self) -> Result<HostKey> {
        Ok(self.scenario.key.clone())
    }
    fn authenticate(&mut self, config: &Config) -> Result<()> {
        self.authenticated.fetch_add(1, Ordering::SeqCst);
        if config.password_auth {
            // Mirrors the real transport: the entered password, otherwise the saved one.
            let password = resolve_password(config)?;
            self.passwords
                .lock()
                .unwrap()
                .push(password.expose().to_string());
        }
        if self.scenario.auth_error {
            Err(error(ErrorCode::Authentication))
        } else {
            Ok(())
        }
    }
    fn canonical_directory(&mut self, path: &str) -> Result<String> {
        Ok(self
            .scenario
            .roots
            .get(path)
            .cloned()
            .unwrap_or_else(|| path.to_string()))
    }
    fn list(&mut self, _: &str, _: usize) -> Result<(Vec<RemoteEntry>, bool)> {
        Ok((self.scenario.entries.clone(), self.scenario.truncated))
    }
}
struct Fixture {
    _root: TempDir,
    db: Db,
    connector: Arc<FakeConnector>,
}
impl Fixture {
    fn new() -> Self {
        let root = TempDir::new().unwrap();
        let db = Db::new(root.path()).unwrap();
        Self {
            _root: root,
            db,
            connector: Arc::new(FakeConnector::new()),
        }
    }
    fn service(&self) -> SftpService {
        SftpService::new(self.db.clone(), self.connector.clone())
    }
    fn connect(&self, service: &mut SftpService) {
        let result = service.connect(config()).unwrap();
        if let Some(challenge) = result.challenge {
            service.confirm_host(&challenge.id).unwrap();
        }
    }
}
#[test]
fn host_trust_is_explicit_and_precedes_authentication() {
    let f = Fixture::new();
    let mut s = f.service();
    assert!(f
        .db
        .setting::<serde_json::Value>("providers.sftp.profile")
        .is_none());
    let probe = s.connect(config()).unwrap();
    let challenge = probe.challenge.unwrap();
    assert_eq!(challenge.key, key(1));
    assert_eq!(f.connector.authenticated.load(Ordering::SeqCst), 0);
    assert!(f
        .db
        .setting::<serde_json::Value>("providers.sftp.trusted_hosts")
        .is_none());
    let state = s.confirm_host(&challenge.id).unwrap();
    assert_eq!(state.status, ConnectionStatus::Connected);
    assert_eq!(state.trusted_key, Some(key(1)));
    assert_eq!(f.connector.authenticated.load(Ordering::SeqCst), 1);
    assert_eq!(state.listing.unwrap().entries.len(), 2);
    assert!(s.confirm_host(&challenge.id).is_err());
}
#[test]
fn changed_key_during_confirmation_never_receives_credentials_or_trust() {
    let f = Fixture::new();
    let mut s = f.service();
    let challenge = s.connect(config()).unwrap().challenge.unwrap();
    f.connector.scenario.lock().unwrap().key = key(2);
    assert_eq!(
        s.confirm_host(&challenge.id).err().unwrap().code,
        ErrorCode::HostKeyChanged
    );
    assert_eq!(f.connector.authenticated.load(Ordering::SeqCst), 0);
    assert!(f
        .db
        .setting::<serde_json::Value>("providers.sftp.trusted_hosts")
        .is_none());
}
#[test]
fn cancel_and_replaced_challenges_cannot_trust_another_endpoint() {
    let f = Fixture::new();
    let mut s = f.service();
    let first = s.connect(config()).unwrap().challenge.unwrap();
    s.cancel_host(&first.id);
    assert_eq!(
        s.confirm_host(&first.id).err().unwrap().code,
        ErrorCode::ConfirmationExpired
    );
    let first = s.connect(config()).unwrap().challenge.unwrap();
    let mut other = config();
    other.port = 3333;
    let second = s.connect(other).unwrap().challenge.unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(
        s.confirm_host(&first.id).err().unwrap().code,
        ErrorCode::ConfirmationExpired
    );
    assert_eq!(f.connector.authenticated.load(Ordering::SeqCst), 0);
    assert!(s.confirm_host(&second.id).is_ok());
}
#[test]
fn restart_reconnect_and_changed_server_key_fail_closed() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    let mut restarted = f.service();
    assert_eq!(
        restarted.state().unwrap().status,
        ConnectionStatus::Configured
    );
    assert!(restarted.reconnect().unwrap().challenge.is_none());
    f.connector.scenario.lock().unwrap().key = key(2);
    let auths = f.connector.authenticated.load(Ordering::SeqCst);
    assert_eq!(
        restarted.reconnect().err().unwrap().code,
        ErrorCode::HostKeyChanged
    );
    assert_eq!(f.connector.authenticated.load(Ordering::SeqCst), auths);
    let mismatch = restarted.state().unwrap().key_mismatch.unwrap();
    assert_eq!(mismatch.expected, key(1));
    assert_eq!(mismatch.observed, key(2));
    assert_eq!(
        restarted
            .forget_host(config().host.clone(), config().port, "wrong")
            .err()
            .unwrap()
            .code,
        ErrorCode::ConfirmationExpired
    );
    restarted
        .forget_host(config().host.clone(), config().port, &key(1).fingerprint)
        .unwrap();
    assert!(restarted.reconnect().unwrap().challenge.is_some());
}
#[test]
fn unavailable_network_and_key_auth_errors_leave_local_and_plex_data_alone() {
    let f = Fixture::new();
    f.db.set_setting("providers.plex.selection", &json!({"preserve":"plex"}))
        .unwrap();
    let mut s = f.service();
    f.connector.scenario.lock().unwrap().network_error = true;
    assert_eq!(
        s.connect(config()).err().unwrap().code,
        ErrorCode::Unreachable
    );
    f.connector.scenario.lock().unwrap().network_error = false;
    f.connector.scenario.lock().unwrap().auth_error = true;
    let challenge = s.connect(config()).unwrap().challenge.unwrap();
    assert_eq!(
        s.confirm_host(&challenge.id).err().unwrap().code,
        ErrorCode::Authentication
    );
    assert!(s.state().unwrap().profile.is_none());
    assert_eq!(f.db.library().unwrap().tracks, 0);
    assert_eq!(
        f.db.setting::<serde_json::Value>("providers.plex.selection")
            .unwrap()["preserve"],
        "plex"
    );
    assert!(
        !providers::descriptors()
            .iter()
            .find(|p| p.id == "sftp")
            .unwrap()
            .playback
    );
}
#[test]
fn root_containment_rejects_traversal_prefix_collisions_and_symlink_escapes() {
    let f = Fixture::new();
    {
        let mut scenario = f.connector.scenario.lock().unwrap();
        scenario
            .roots
            .insert("/media/Music/Outside".into(), "/media/Music-other".into());
        scenario
            .roots
            .insert("/media/Music/Linked".into(), "/private".into());
    }
    let mut s = f.service();
    f.connect(&mut s);
    for path in [
        "../private",
        "/private",
        "Album/../../private",
        "Outside",
        "Linked",
    ] {
        assert_eq!(
            s.browse(path).err().unwrap().code,
            ErrorCode::PathOutsideRoot
        );
    }
    assert_eq!(s.state().unwrap().profile.unwrap().root, "/media/Music");
    assert_eq!(
        s.browse("Album").unwrap().listing.unwrap().relative,
        "Album"
    );
}
#[test]
fn folder_selection_persists_and_disconnect_keeps_only_public_server_trust() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    let state = s.choose_folder("Album").unwrap();
    assert_eq!(state.profile.unwrap().root, "/media/Music/Album");
    assert_eq!(state.listing.unwrap().parent, None);
    s.disconnect().unwrap();
    let state = s.state().unwrap();
    assert_eq!(state.status, ConnectionStatus::Disconnected);
    assert!(state.profile.is_none());
    assert!(f
        .db
        .setting::<serde_json::Value>("providers.sftp.trusted_hosts")
        .is_some());
    assert!(f.service().state().unwrap().profile.is_none());
    assert_eq!(f.db.library().unwrap().tracks, 0);
}
#[test]
fn malformed_entries_are_not_used_as_remote_paths_and_empty_truncated_listings_are_explicit() {
    let f = Fixture::new();
    f.connector.scenario.lock().unwrap().entries = vec![RemoteEntry {
        name: "../secret".into(),
        kind: EntryKind::Directory,
        size: None,
        modified: None,
    }];
    let mut s = f.service();
    let challenge = s.connect(config()).unwrap().challenge.unwrap();
    assert_eq!(
        s.confirm_host(&challenge.id).err().unwrap().code,
        ErrorCode::Protocol
    );
    f.connector.scenario.lock().unwrap().entries.clear();
    f.connector.scenario.lock().unwrap().truncated = true;
    let state = s.connect(config()).unwrap().state;
    let listing = state.listing.unwrap();
    assert!(listing.entries.is_empty());
    assert!(listing.truncated);
}
#[test]
fn configuration_validation_allows_real_ssh_ports_and_ipv6_but_rejects_urls_and_public_key_files() {
    assert!(config().validate().is_ok());
    let mut c = config();
    c.host = "[::1]".into();
    assert_eq!(c.validate().unwrap().host, "::1");
    for host in [
        "ssh://example.test",
        "user@example.test",
        "example.test:22",
        "example.test/path",
        "bad host",
    ] {
        let mut c = config();
        c.host = host.into();
        assert!(c.validate().is_err());
    }
    let mut c = config();
    c.port = 0;
    assert!(c.validate().is_err());
    let mut c = config();
    c.identity_file = Some("/tmp/id_ed25519.pub".into());
    assert_eq!(c.validate().err().unwrap().code, ErrorCode::KeyFile);
    let mut c = config();
    c.root = "/media/../private".into();
    assert!(c.validate().is_err());
    for ip in [
        "169.254.169.254",
        "100.100.100.200",
        "0.0.0.0",
        "224.0.0.1",
        "::ffff:127.0.0.1",
        "fd00:ec2::254",
    ] {
        assert!(!allowed_ip(ip.parse().unwrap()));
    }
    for ip in [
        "127.0.0.1",
        "192.168.1.3",
        "100.101.102.103",
        "::1",
        "fd12::1",
    ] {
        assert!(allowed_ip(ip.parse().unwrap()));
    }
}

#[derive(Default)]
struct MemoryStore(Mutex<HashMap<String, String>>);
impl CredentialStore for MemoryStore {
    fn get(&self, slot: &str) -> providers::Result<Option<String>> {
        Ok(self.0.lock().unwrap().get(slot).cloned())
    }
    fn set(&self, slot: &str, value: &str) -> providers::Result<()> {
        self.0.lock().unwrap().insert(slot.into(), value.into());
        Ok(())
    }
    fn delete(&self, slot: &str) -> providers::Result<()> {
        self.0.lock().unwrap().remove(slot);
        Ok(())
    }
}
/// One process-wide store, matching the app; each password test uses its own username.
fn passwords() -> Arc<MemoryStore> {
    static STORE: std::sync::OnceLock<Arc<MemoryStore>> = std::sync::OnceLock::new();
    STORE
        .get_or_init(|| {
            let store = Arc::new(MemoryStore::default());
            install_password_store(store.clone());
            store
        })
        .clone()
}
fn password_config(username: &str, password: Option<&str>) -> Config {
    let mut c = config();
    c.username = username.into();
    c.password_auth = true;
    c.password = password.map(Secret::new);
    c
}
#[test]
fn password_is_kept_in_the_credential_store_not_settings() {
    let store = passwords();
    let f = Fixture::new();
    let mut s = f.service();
    let probe = s
        .connect(password_config("pw-store", Some("synthetic-pass")))
        .unwrap();
    let state = s.confirm_host(&probe.challenge.unwrap().id).unwrap();
    assert_eq!(state.status, ConnectionStatus::Connected);
    assert_eq!(*f.connector.passwords.lock().unwrap(), ["synthetic-pass"]);
    let saved =
        f.db.setting::<serde_json::Value>("providers.sftp.profile")
            .unwrap();
    assert_eq!(saved["passwordAuth"], json!(true));
    assert!(!saved.to_string().contains("synthetic-pass"));
    let returned = serde_json::to_string(&state).unwrap();
    assert!(!returned.contains("synthetic-pass"));
    assert!(!returned.contains("\"password\""));
    assert!(!format!("{:?}", state.profile).contains("synthetic-pass"));
    assert_eq!(
        store
            .get("sftp.password:pw-store@[music.example.test]:2222")
            .unwrap()
            .as_deref(),
        Some("synthetic-pass")
    );
    // A new service (app restart) reconnects with the saved password.
    let mut restarted = f.service();
    restarted.reconnect().unwrap();
    assert_eq!(
        *f.connector.passwords.lock().unwrap(),
        ["synthetic-pass", "synthetic-pass"]
    );
    restarted.disconnect().unwrap();
    assert_eq!(
        store
            .get("sftp.password:pw-store@[music.example.test]:2222")
            .unwrap(),
        None
    );
}
#[test]
fn missing_or_rejected_password_does_not_save_anything() {
    let store = passwords();
    let f = Fixture::new();
    let mut s = f.service();
    let probe = s.connect(password_config("pw-missing", None)).unwrap();
    let err = s.confirm_host(&probe.challenge.unwrap().id).err().unwrap();
    assert_eq!(err.code, ErrorCode::PasswordMissing);
    f.connector.scenario.lock().unwrap().auth_error = true;
    // The server key was trusted above, so this connect authenticates directly.
    let err = s
        .connect(password_config("pw-missing", Some("wrong")))
        .err()
        .unwrap();
    assert_eq!(err.code, ErrorCode::Authentication);
    assert!(f
        .db
        .setting::<serde_json::Value>("providers.sftp.profile")
        .is_none());
    assert_eq!(
        store
            .get("sftp.password:pw-missing@[music.example.test]:2222")
            .unwrap(),
        None
    );
}
#[test]
fn switching_to_key_sign_in_removes_the_saved_password() {
    let store = passwords();
    let f = Fixture::new();
    let mut s = f.service();
    let probe = s
        .connect(password_config("pw-switch", Some("synthetic-pass")))
        .unwrap();
    s.confirm_host(&probe.challenge.unwrap().id).unwrap();
    let mut agent = config();
    agent.username = "pw-switch".into();
    s.connect(agent).unwrap();
    let saved =
        f.db.setting::<serde_json::Value>("providers.sftp.profile")
            .unwrap();
    assert!(saved.get("passwordAuth").is_none());
    assert_eq!(
        store
            .get("sftp.password:pw-switch@[music.example.test]:2222")
            .unwrap(),
        None
    );
}
#[test]
fn password_configuration_is_validated() {
    let mut c = config();
    c.password = Some(Secret::new("x"));
    assert_eq!(c.validate().err().unwrap().code, ErrorCode::InvalidConfig);
    let mut c = password_config("pw-valid", Some(""));
    assert!(c.clone().validate().is_err());
    c.password = Some(Secret::new("a\0b"));
    assert!(c.clone().validate().is_err());
    c.password = Some(Secret::new("ok"));
    c.identity_file = Some("/home/user/.ssh/id_ed25519".into());
    assert!(c.validate().is_err());
    let legacy: Config = serde_json::from_value(json!({
        "host": "music.example.test", "port": 22, "username": "u",
        "root": "/m", "identityFile": null
    }))
    .unwrap();
    assert!(!legacy.password_auth);
    assert_eq!(
        serde_json::to_value(&legacy).unwrap(),
        json!({"host": "music.example.test", "port": 22, "username": "u", "root": "/m", "identityFile": null})
    );
}
