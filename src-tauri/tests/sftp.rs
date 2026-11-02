use muse_lib::{
    db::Db,
    providers::{self, sftp::*, sftp_transport::allowed_ip},
};
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
        }
    }
}
struct FakeSession {
    scenario: Scenario,
    authenticated: Arc<AtomicUsize>,
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
        }))
    }
}
impl RemoteSession for FakeSession {
    fn host_key(&self) -> Result<HostKey> {
        Ok(self.scenario.key.clone())
    }
    fn authenticate(&mut self, _: &Config) -> Result<()> {
        self.authenticated.fetch_add(1, Ordering::SeqCst);
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
