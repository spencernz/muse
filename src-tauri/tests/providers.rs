use muse_lib::{
    db::Db,
    providers::{
        self,
        credentials::CredentialStore,
        metadata::normalize,
        plex::{ConnectionState, PlexService},
        transport::{HttpTransport, ServerTarget, Transport},
        ErrorCode, LocalProvider, MediaKind, MetadataItem, MusicProvider, Result,
    },
};
use reqwest::Method;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tempfile::TempDir;

#[derive(Default)]
struct Vault {
    value: Mutex<Option<String>>,
    fail: AtomicBool,
}
impl CredentialStore for Vault {
    fn get(&self, _: &str) -> Result<Option<String>> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(providers::error(ErrorCode::CredentialStore));
        }
        Ok(self.value.lock().unwrap().clone())
    }
    fn set(&self, _: &str, value: &str) -> Result<()> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(providers::error(ErrorCode::CredentialStore));
        }
        *self.value.lock().unwrap() = Some(value.into());
        Ok(())
    }
    fn delete(&self, _: &str) -> Result<()> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(providers::error(ErrorCode::CredentialStore));
        }
        *self.value.lock().unwrap() = None;
        Ok(())
    }
}
struct Call {
    origin: String,
    path: String,
    token: Option<String>,
    method: Method,
    form: Vec<(String, String)>,
}
#[derive(Default)]
struct MockHttp {
    replies: Mutex<VecDeque<(String, Result<Value>)>>,
    calls: Mutex<Vec<Call>>,
}
impl MockHttp {
    fn reply(&self, path: &str, value: Value) {
        self.replies
            .lock()
            .unwrap()
            .push_back((path.into(), Ok(value)));
    }
    fn failure(&self, path: &str, code: ErrorCode) {
        self.replies
            .lock()
            .unwrap()
            .push_back((path.into(), Err(providers::error(code))));
    }
}
impl Transport for MockHttp {
    fn request(
        &self,
        target: &ServerTarget,
        method: Method,
        path: &str,
        token: Option<&str>,
        _: &str,
        form: &[(&str, &str)],
    ) -> Result<Value> {
        self.calls.lock().unwrap().push(Call {
            origin: target.url(),
            path: path.into(),
            token: token.map(str::to_string),
            method,
            form: form
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        });
        let (expected, result) = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected outgoing request");
        assert_eq!(path, expected);
        result
    }
}
struct Fixture {
    _root: TempDir,
    db: Db,
    http: Arc<MockHttp>,
    vault: Arc<Vault>,
}
impl Fixture {
    fn new() -> Self {
        let root = TempDir::new().unwrap();
        let db = Db::new(root.path()).unwrap();
        Self {
            _root: root,
            db,
            http: Arc::new(MockHttp::default()),
            vault: Arc::new(Vault::default()),
        }
    }
    fn service(&self) -> PlexService {
        PlexService::new(self.db.clone(), self.http.clone(), self.vault.clone()).unwrap()
    }
    fn identity(&self) {
        self.http.reply(
            "/identity",
            json!({"MediaContainer":{"machineIdentifier":"server-a","friendlyName":"Living room"}}),
        );
    }
    fn libraries(&self) {
        self.http.reply("/library/sections", json!({"MediaContainer":{"size":2,"Directory":[{"key":"4","type":"artist","title":"Music"},{"key":"5","type":"movie","title":"Movies"}]}}));
    }
    fn connect(&self, service: &mut PlexService) {
        self.identity();
        self.libraries();
        service
            .manual("https://plex.example.test:32400", "server-secret", false)
            .unwrap();
    }
    fn select(&self, service: &mut PlexService) {
        self.identity();
        self.libraries();
        service.select_library("4").unwrap();
    }
    fn auth(&self, service: &mut PlexService) {
        self.http.reply(
            "/api/v2/pins",
            json!({"id":11,"code":"pin-code","expiresIn":300}),
        );
        service.begin_auth().unwrap();
        self.http.reply(
            "/api/v2/pins/11",
            json!({"id":11,"code":"pin-code","authToken":"account-secret"}),
        );
        self.http.reply("/api/v2/user", json!({"id":42}));
        assert!(service.poll_auth(11).unwrap().complete);
    }
}

#[test]
fn auth_links_browser_without_tokens_and_keeps_account_tokens_native() {
    let f = Fixture::new();
    let mut service = f.service();
    f.auth(&mut service);
    let state = service.state().unwrap();
    assert!(state.account_connected);
    let visible = serde_json::to_string(&state).unwrap();
    assert!(!visible.contains("account-secret"));
    let calls = f.http.calls.lock().unwrap();
    assert_eq!(calls[0].method, Method::POST);
    assert_eq!(calls[0].form, vec![("strong".into(), "true".into())]);
    assert_eq!(calls[0].origin, "https://plex.tv");
    assert!(calls[1].token.is_none());
    assert_eq!(calls[2].token.as_deref(), Some("account-secret"));
    assert!(calls.iter().all(|c| !c.path.contains("secret")));
    assert!(f
        .db
        .setting::<Value>("providers.plex.selection")
        .is_none_or(|v| v.is_null()));
    assert!(!std::fs::read(f.db.path.clone())
        .unwrap()
        .windows(14)
        .any(|v| v == b"account-secret"));
}
#[test]
fn pin_cancellation_replacement_expiry_and_mismatched_response_are_safe() {
    let f = Fixture::new();
    let mut s = f.service();
    f.http.reply("/api/v2/pins", json!({"id":1,"code":"first"}));
    let pin = s.begin_auth().unwrap();
    assert!(pin.url.starts_with("https://app.plex.tv/auth#?clientID="));
    assert!(!pin.url.contains("Token"));
    f.http.reply(
        "/api/v2/pins",
        json!({"id":2,"code":"second","expiresIn":1}),
    );
    s.begin_auth().unwrap();
    assert_eq!(
        s.poll_auth(1).err().unwrap().code,
        ErrorCode::SignInCancelled
    );
    s.cancel_auth(1);
    assert!(s.auth_url(2).is_ok());
    f.http.reply(
        "/api/v2/pins/2",
        json!({"id":2,"code":"wrong","authToken":"must-not-save"}),
    );
    assert_eq!(
        s.poll_auth(2).err().unwrap().code,
        ErrorCode::InvalidResponse
    );
    assert!(f.vault.value.lock().unwrap().is_none());
    thread::sleep(Duration::from_millis(1100));
    assert_eq!(s.poll_auth(2).err().unwrap().code, ErrorCode::SignInExpired);
    assert!(s.auth_url(2).is_err());
}
#[test]
fn auth_network_errors_never_persist_credentials_or_clear_a_working_selection() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    f.http.reply("/api/v2/pins", json!({"id":3,"code":"third"}));
    s.begin_auth().unwrap();
    f.http.failure("/api/v2/pins/3", ErrorCode::Unauthorized);
    assert_eq!(s.poll_auth(3).err().unwrap().code, ErrorCode::Unauthorized);
    assert!(s.state().unwrap().selection.is_some());
    assert!(!s.state().unwrap().account_connected);
}
#[test]
fn discovery_uses_account_only_on_plex_tv_and_server_specific_credentials_on_servers() {
    let f = Fixture::new();
    let mut s = f.service();
    f.auth(&mut s);
    f.http.reply("/api/v2/resources?includeHttps=1&includeRelay=0&includeIPv6=1", json!([
        {"name":"Living room","clientIdentifier":"server-a","provides":"server","accessToken":"server-only", "connections":[{"uri":"https://plex.example.test:32400"},{"uri":"file:///private"},{"uri":"https://169.254.169.254"}]},
        {"name":"A player","provides":"player"}
    ]));
    let state = s.discover().unwrap();
    assert_eq!(state.servers.len(), 1);
    assert_eq!(state.servers[0].connections, 1);
    f.identity();
    f.libraries();
    let state = s.select_server("server-a", false).unwrap();
    assert_eq!(state.libraries.len(), 1);
    assert_eq!(state.libraries[0].id, "4");
    let calls = f.http.calls.lock().unwrap();
    for call in calls.iter().filter(|c| c.origin != "https://plex.tv") {
        assert_eq!(call.token.as_deref(), Some("server-only"));
    }
    let serialized = serde_json::to_string(&state).unwrap();
    assert!(!serialized.contains("secret"));
    assert!(!serialized.contains("server-only"));
}
#[test]
fn saved_selection_reconnects_offline_from_vault_and_disconnect_removes_only_plex() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    f.select(&mut s);
    f.db.set_setting("user-setting", &"preserve").unwrap();
    let mut restarted = f.service();
    assert_eq!(
        restarted.state().unwrap().status,
        ConnectionState::Configured
    );
    f.identity();
    f.libraries();
    assert_eq!(
        restarted.reconnect().unwrap().status,
        ConnectionState::Connected
    );
    let clean = restarted.disconnect().unwrap();
    assert!(clean.selection.is_none());
    assert!(!clean.account_connected);
    assert!(f.vault.value.lock().unwrap().is_none());
    assert!(f
        .db
        .setting::<Value>("providers.plex.selection")
        .unwrap()
        .is_null());
    assert_eq!(
        f.db.setting::<String>("user-setting").as_deref(),
        Some("preserve")
    );
    assert_eq!(f.db.library().unwrap().tracks, 0);
}
#[test]
fn vault_failure_never_saves_a_plaintext_token_or_selection() {
    let f = Fixture::new();
    let mut s = f.service();
    f.vault.fail.store(true, Ordering::SeqCst);
    f.identity();
    f.libraries();
    assert_eq!(
        s.manual("https://plex.example.test", "hidden-token", false)
            .err()
            .unwrap()
            .code,
        ErrorCode::CredentialStore
    );
    assert!(f.db.setting::<Value>("providers.plex.selection").is_none());
    assert!(f.vault.value.lock().unwrap().is_none());
}
#[test]
fn transient_and_auth_failures_retain_configuration_for_retry_and_reject_foreign_library_ids() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    f.select(&mut s);
    f.http.failure("/identity", ErrorCode::Unreachable);
    assert_eq!(s.test().err().unwrap().code, ErrorCode::Unreachable);
    assert_eq!(s.state().unwrap().status, ConnectionState::Error);
    assert!(s.state().unwrap().selection.unwrap().library.is_some());
    f.identity();
    f.libraries();
    assert!(s.reconnect().is_ok());
    f.http.failure("/identity", ErrorCode::Unauthorized);
    assert_eq!(s.test().err().unwrap().code, ErrorCode::Unauthorized);
    f.identity();
    f.libraries();
    assert_eq!(
        s.select_library("5").err().unwrap().code,
        ErrorCode::LibraryUnavailable
    );
    assert_eq!(
        s.select_library("../4").err().unwrap().code,
        ErrorCode::InvalidResponse
    );
    f.http.reply(
        "/identity",
        json!({"MediaContainer":{"machineIdentifier":"another-server"}}),
    );
    assert_eq!(s.test().err().unwrap().code, ErrorCode::InvalidResponse);
}
#[test]
fn missing_music_library_can_be_replaced_and_empty_libraries_are_valid() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    f.select(&mut s);
    f.identity();
    f.http
        .reply("/library/sections", json!({"MediaContainer":{"size":0}}));
    assert_eq!(s.test().err().unwrap().code, ErrorCode::LibraryUnavailable);
    assert_eq!(s.state().unwrap().status, ConnectionState::ChooseLibrary);
    f.identity();
    f.http.reply(
        "/library/sections",
        json!({"MediaContainer":{"Directory":[{"key":"9","type":"artist","title":"New music"}]}}),
    );
    assert_eq!(
        s.select_library("9")
            .unwrap()
            .selection
            .unwrap()
            .library
            .unwrap()
            .id,
        "9"
    );
}
#[test]
fn verification_retrieves_bounded_pages_without_touching_local_catalog_or_artwork_urls() {
    let f = Fixture::new();
    let mut s = f.service();
    f.connect(&mut s);
    f.select(&mut s);
    f.identity();
    f.libraries();
    for (kind, ty) in [(8, "artist"), (9, "album"), (10, "track")] {
        f.http.reply(&format!("/library/sections/4/all?type={kind}&X-Plex-Container-Start=0&X-Plex-Container-Size=3"),json!({"MediaContainer":{"size":1,"totalSize":25,"Metadata":[{"type":ty,"ratingKey":"12","parentRatingKey":"11","title":"Sample","duration":181123,"thumb":"/library/metadata/12/thumb/99"}]}}));
    }
    let preview = s.verify_metadata().unwrap();
    assert_eq!(preview.tracks.total, 25);
    let visible = serde_json::to_value(&preview).unwrap();
    assert_eq!(visible["tracks"]["items"][0]["track"]["duration"], 181.123);
    assert!(visible["tracks"]["items"][0]["track"]["cover"].is_null());
    assert_eq!(
        visible["tracks"]["items"][0]["artwork"]["serverId"],
        "server-a"
    );
    assert_eq!(f.db.library().unwrap().tracks, 0);
    assert_eq!(
        LocalProvider(f.db.clone())
            .metadata("local", MediaKind::Track, 0, 25)
            .unwrap()
            .total,
        0
    );
    assert!(LocalProvider(f.db.clone())
        .metadata("4", MediaKind::Track, 0, 25)
        .is_err());
    assert!(
        !providers::descriptors()
            .iter()
            .find(|p| p.id == "plex")
            .unwrap()
            .playback
    );
}
#[test]
fn metadata_has_stable_server_namespaces_units_fallbacks_and_safe_artwork_refs() {
    let payload = json!({"MediaContainer":{"totalSize":1,"Metadata":[{"type":"track","ratingKey":123,"parentRatingKey":"12","duration":245001,"index":3,"parentIndex":2,"year":2025,"grandparentTitle":"Album artist","originalTitle":"Guest","thumb":"https://evil.test/image?X-Plex-Token=bad","parentThumb":"/library/metadata/12/thumb/99","Genre":[{"tag":"Jazz"}]}]}});
    let a = normalize(payload.clone(), "server-a", MediaKind::Track, 0, 3).unwrap();
    let b = normalize(payload, "server-b", MediaKind::Track, 0, 3).unwrap();
    let av = serde_json::to_value(a).unwrap();
    let bv = serde_json::to_value(b).unwrap();
    assert_eq!(av["items"][0]["track"]["title"], "Untitled track");
    assert_eq!(av["items"][0]["track"]["artist"], "Guest");
    assert_eq!(av["items"][0]["track"]["albumArtist"], "Album artist");
    assert_eq!(av["items"][0]["track"]["duration"], 245.001);
    assert_eq!(av["items"][0]["track"]["albumId"], "plex:server-a:12");
    assert_ne!(av["items"][0]["track"]["id"], bv["items"][0]["track"]["id"]);
    assert_eq!(
        av["items"][0]["artwork"]["key"],
        "/library/metadata/12/thumb/99"
    );
    assert!(!av.to_string().contains("evil"));
    let empty = normalize(
        json!({"MediaContainer":{"size":0}}),
        "server-a",
        MediaKind::Album,
        0,
        3,
    )
    .unwrap();
    assert!(empty.items.is_empty());
    assert!(normalize(
        json!({"MediaContainer":{"Metadata":[{"type":"album","ratingKey":"../12"}]}}),
        "server-a",
        MediaKind::Album,
        0,
        3
    )
    .is_err());
    let fallback = normalize(
        json!({"MediaContainer":{"Metadata":[{"type":"artist","ratingKey":"1"}]}}),
        "server-a",
        MediaKind::Artist,
        0,
        3,
    )
    .unwrap();
    assert!(
        matches!(&fallback.items[0],MetadataItem::Artist{artist,..} if artist.name=="Unknown artist")
    );
}
#[test]
fn server_origin_policy_blocks_credentials_metadata_targets_and_unapproved_plaintext() {
    for value in [
        "file:///tmp",
        "https://user:pass@example.test",
        "https://@example.test",
        "https://example.test/path",
        "https://example.test/a/..",
        "https://example.test?X-Plex-Token=secret",
        "https://example.test#secret",
        "https://169.254.169.254",
        "https://[::ffff:127.0.0.1]",
        "https://[fd00:ec2::254]",
        "http://8.8.8.8:32400",
        "https://exa\nmple.test",
    ] {
        assert!(
            ServerTarget::parse(value, true).is_err(),
            "accepted unsafe origin"
        );
    }
    assert!(ServerTarget::parse("http://127.0.0.1:32400", false).is_err());
    assert!(ServerTarget::parse("http://192.168.1.10:32400", true).is_ok());
    assert!(ServerTarget::parse("https://plex.example.test:32400", false).is_ok());
}

fn fixture_response(
    status: &str,
    headers: &str,
    body: &str,
) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let response = format!("HTTP/1.1 {status}\r\nConnection: close\r\n{headers}\r\n{body}");
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        let mut buf = [0; 1024];
        loop {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            request.extend_from_slice(&buf[..n]);
            if request.windows(4).any(|v| v == b"\r\n\r\n") {
                break;
            }
        }
        let _ = stream.write_all(response.as_bytes());
        String::from_utf8(request).unwrap()
    });
    (origin, handle)
}
#[test]
fn real_transport_sends_secret_only_in_headers_and_never_follows_redirects() {
    let body = "{\"MediaContainer\":{\"size\":0}}";
    let (origin, server) = fixture_response(
        "200 OK",
        &format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            body.len()
        ),
        body,
    );
    let data = HttpTransport
        .request(
            &ServerTarget::parse(&origin.replace("127.0.0.1", "localhost"), true).unwrap(),
            Method::GET,
            "/library/sections",
            Some("synthetic-secret"),
            "test-client",
            &[],
        )
        .unwrap();
    assert_eq!(data["MediaContainer"]["size"], 0);
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /library/sections HTTP/1.1"));
    assert!(request
        .to_lowercase()
        .contains("x-plex-token: synthetic-secret"));
    assert!(!request.lines().next().unwrap().contains("secret"));
    let (origin, server) = fixture_response(
        "302 Found",
        "Location: http://169.254.169.254/latest/meta-data\r\nContent-Length: 0\r\n",
        "",
    );
    let result = HttpTransport.request(
        &ServerTarget::parse(&origin, true).unwrap(),
        Method::GET,
        "/identity",
        Some("synthetic-secret"),
        "test-client",
        &[],
    );
    assert_eq!(result.err().unwrap().code, ErrorCode::UnsafeAddress);
    server.join().unwrap();
}
#[test]
fn real_transport_redacts_auth_parse_and_oversized_response_errors() {
    for (status, headers, body, expected) in [
        (
            "401 Unauthorized",
            "Content-Length: 16\r\n",
            "synthetic-secret",
            ErrorCode::Unauthorized,
        ),
        (
            "200 OK",
            "Content-Length: 16\r\n",
            "synthetic-secret",
            ErrorCode::InvalidResponse,
        ),
        (
            "200 OK",
            "Content-Length: 5000000\r\n",
            "",
            ErrorCode::ResponseTooLarge,
        ),
    ] {
        let (origin, server) = fixture_response(status, headers, body);
        let failure = HttpTransport
            .request(
                &ServerTarget::parse(&origin, true).unwrap(),
                Method::GET,
                "/identity",
                Some("synthetic-secret"),
                "test-client",
                &[],
            )
            .err()
            .unwrap();
        assert_eq!(failure.code, expected);
        assert!(!serde_json::to_string(&failure)
            .unwrap()
            .contains("synthetic-secret"));
        server.join().unwrap();
    }
}

#[test]
fn real_transport_bounds_body_even_without_content_length() {
    let body = "x".repeat(4 * 1024 * 1024 + 1);
    let (origin, server) = fixture_response("200 OK", "Content-Type: application/json\r\n", &body);
    let failure = HttpTransport
        .request(
            &ServerTarget::parse(&origin, true).unwrap(),
            Method::GET,
            "/identity",
            Some("synthetic-secret"),
            "test-client",
            &[],
        )
        .err()
        .unwrap();
    assert_eq!(failure.code, ErrorCode::ResponseTooLarge);
    server.join().unwrap();
}
