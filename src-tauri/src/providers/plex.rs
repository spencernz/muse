use super::{
    credentials::CredentialStore,
    error,
    metadata::{identifier, key, normalize, numeric},
    transport::{validate_token, ServerTarget, Transport},
    ErrorCode, MediaKind, MetadataPage, MusicLibrary, MusicProvider, Result,
};
use crate::db::{now, Db};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

const SETTINGS: &str = "providers.plex.selection";
const SECRETS: &str = "plex.credentials";
#[derive(Default, Serialize, Deserialize)]
struct Secrets {
    account: Option<String>,
    server: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub server_id: String,
    pub server_name: String,
    pub url: String,
    pub allow_local_http: bool,
    pub library: Option<SelectedLibrary>,
    pub account: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SelectedLibrary {
    pub id: String,
    pub title: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
    pub id: String,
    pub name: String,
    pub connections: usize,
}
struct Resource {
    summary: ServerSummary,
    token: String,
    targets: Vec<String>,
}
struct PendingPin {
    id: u64,
    code: String,
    expires: i64,
    url: String,
    last_poll: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStart {
    pub id: u64,
    pub url: String,
    pub expires_at: i64,
}
#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Configured,
    ChooseLibrary,
    Connected,
    Error,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlexState {
    pub account_connected: bool,
    pub status: ConnectionState,
    pub selection: Option<Selection>,
    pub servers: Vec<ServerSummary>,
    pub libraries: Vec<MusicLibrary>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPoll {
    pub complete: bool,
    pub state: PlexState,
}
#[derive(Serialize)]
pub struct Verification {
    pub artists: MetadataPage,
    pub albums: MetadataPage,
    pub tracks: MetadataPage,
}

pub struct PlexProvider<'a> {
    pub transport: &'a dyn Transport,
    pub target: ServerTarget,
    pub token: &'a str,
    pub client_id: &'a str,
    pub server_id: &'a str,
}
impl PlexProvider<'_> {
    fn get(&self, path: &str) -> Result<Value> {
        self.transport.request(
            &self.target,
            Method::GET,
            path,
            Some(self.token),
            self.client_id,
            &[],
        )
    }
    pub fn verify_identity(&self) -> Result<()> {
        let value = self.get("/identity")?;
        let found = value
            .pointer("/MediaContainer/machineIdentifier")
            .and_then(Value::as_str)
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        if found != self.server_id {
            return Err(error(ErrorCode::InvalidResponse));
        }
        Ok(())
    }
}
impl MusicProvider for PlexProvider<'_> {
    fn libraries(&self) -> Result<Vec<MusicLibrary>> {
        let value = self.get("/library/sections")?;
        let container = value
            .get("MediaContainer")
            .filter(|v| v.is_object())
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        let empty = Vec::new();
        let rows = match container.get("Directory") {
            Some(v) => v
                .as_array()
                .ok_or_else(|| error(ErrorCode::InvalidResponse))?,
            None if container.get("size").and_then(Value::as_u64) == Some(0) => &empty,
            None => return Err(error(ErrorCode::InvalidResponse)),
        };
        if rows.len() > 256 {
            return Err(error(ErrorCode::ResponseTooLarge));
        }
        rows.iter()
            .filter(|row| row.get("type").and_then(Value::as_str) == Some("artist"))
            .map(|row| {
                Ok(MusicLibrary {
                    id: key(row, "key")?,
                    title: row
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("Music")
                        .into(),
                })
            })
            .collect()
    }
    fn metadata(
        &self,
        library: &str,
        kind: MediaKind,
        offset: usize,
        limit: usize,
    ) -> Result<MetadataPage> {
        numeric(library)?;
        let limit = limit.clamp(1, 25);
        if offset > 100000 {
            return Err(error(ErrorCode::InvalidResponse));
        }
        let path = format!("/library/sections/{library}/all?type={}&X-Plex-Container-Start={offset}&X-Plex-Container-Size={limit}", kind.plex_type());
        normalize(self.get(&path)?, self.server_id, kind, offset, limit)
    }
}

/// Serialized by the command layer; neither secrets nor raw Plex payloads cross IPC.
pub struct PlexService {
    db: Db,
    transport: Arc<dyn Transport>,
    vault: Arc<dyn CredentialStore>,
    client_id: String,
    selection: Option<Selection>,
    resources: HashMap<String, Resource>,
    pin: Option<PendingPin>,
    libraries: Vec<MusicLibrary>,
    status: ConnectionState,
}
impl PlexService {
    pub fn new(
        db: Db,
        transport: Arc<dyn Transport>,
        vault: Arc<dyn CredentialStore>,
    ) -> Result<Self> {
        let client_id = db
            .setting::<String>("providers.client_id")
            .filter(|id| identifier(id).is_ok())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        db.set_setting("providers.client_id", &client_id)
            .map_err(|_| error(ErrorCode::Storage))?;
        let selection: Option<Selection> = db.setting(SETTINGS);
        let status = if selection.is_some() {
            ConnectionState::Configured
        } else {
            ConnectionState::Disconnected
        };
        Ok(Self {
            db,
            transport,
            vault,
            client_id,
            selection,
            resources: HashMap::new(),
            pin: None,
            libraries: vec![],
            status,
        })
    }
    fn secrets(&self) -> Result<Secrets> {
        self.vault
            .get(SECRETS)?
            .map(|value| {
                serde_json::from_str(&value).map_err(|_| error(ErrorCode::CredentialStore))
            })
            .transpose()
            .map(Option::unwrap_or_default)
    }
    fn write_secrets(&self, secrets: &Secrets) -> Result<()> {
        self.vault.set(
            SECRETS,
            &serde_json::to_string(secrets).map_err(|_| error(ErrorCode::CredentialStore))?,
        )
    }
    pub fn state(&self) -> Result<PlexState> {
        let mut servers: Vec<_> = self.resources.values().map(|r| r.summary.clone()).collect();
        servers.sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
        Ok(PlexState {
            account_connected: self.secrets()?.account.is_some(),
            status: self.status,
            selection: self.selection.clone(),
            servers,
            libraries: self.libraries.clone(),
        })
    }
    fn account_request(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        form: &[(&str, &str)],
    ) -> Result<Value> {
        self.transport.request(
            &ServerTarget::parse("https://plex.tv", false)?,
            method,
            path,
            token,
            &self.client_id,
            form,
        )
    }
    pub fn begin_auth(&mut self) -> Result<AuthStart> {
        self.pin = None;
        let response =
            self.account_request(Method::POST, "/api/v2/pins", None, &[("strong", "true")])?;
        let id = response
            .get("id")
            .and_then(Value::as_u64)
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        let code = response
            .get("code")
            .and_then(Value::as_str)
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        identifier(code)?;
        let ttl = response
            .get("expiresIn")
            .and_then(Value::as_i64)
            .unwrap_or(300)
            .clamp(1, 1800);
        let expires = now() + ttl;
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        query
            .append_pair("clientID", &self.client_id)
            .append_pair("code", code)
            .append_pair("context[device][product]", "Muse");
        let url = format!("https://app.plex.tv/auth#?{}", query.finish());
        self.pin = Some(PendingPin {
            id,
            code: code.into(),
            expires,
            url: url.clone(),
            last_poll: 0,
        });
        Ok(AuthStart {
            id,
            url,
            expires_at: expires,
        })
    }
    pub fn auth_url(&self, id: u64) -> Result<String> {
        let pin = self
            .pin
            .as_ref()
            .filter(|p| p.id == id)
            .ok_or_else(|| error(ErrorCode::SignInCancelled))?;
        if now() >= pin.expires {
            return Err(error(ErrorCode::SignInExpired));
        }
        Ok(pin.url.clone())
    }
    pub fn cancel_auth(&mut self, id: u64) {
        if self.pin.as_ref().is_some_and(|p| p.id == id) {
            self.pin = None;
        }
    }
    pub fn poll_auth(&mut self, id: u64) -> Result<AuthPoll> {
        let pin = self
            .pin
            .as_ref()
            .filter(|p| p.id == id)
            .ok_or_else(|| error(ErrorCode::SignInCancelled))?;
        if now() >= pin.expires {
            self.pin = None;
            return Err(error(ErrorCode::SignInExpired));
        }
        if now() - pin.last_poll < 1 {
            return Ok(AuthPoll {
                complete: false,
                state: self.state()?,
            });
        }
        let code = pin.code.clone();
        self.pin.as_mut().unwrap().last_poll = now();
        let response =
            self.account_request(Method::GET, &format!("/api/v2/pins/{id}"), None, &[])?;
        if response.get("id").and_then(Value::as_u64) != Some(id)
            || response.get("code").and_then(Value::as_str) != Some(&code)
        {
            return Err(error(ErrorCode::InvalidResponse));
        }
        if let Some(token) = response
            .get("authToken")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            validate_token(token)?;
            // Validate the account token with plex.tv only, never with an arbitrary server.
            self.account_request(Method::GET, "/api/v2/user", Some(token), &[])?;
            let old = self.secrets()?;
            self.write_secrets(&Secrets {
                account: Some(token.into()),
                server: None,
            })?;
            if self
                .db
                .set_setting(SETTINGS, &Option::<Selection>::None)
                .is_err()
            {
                self.write_secrets(&old)?;
                return Err(error(ErrorCode::Storage));
            }
            self.pin = None;
            self.selection = None;
            self.resources.clear();
            self.libraries.clear();
            self.status = ConnectionState::Disconnected;
            Ok(AuthPoll {
                complete: true,
                state: self.state()?,
            })
        } else {
            Ok(AuthPoll {
                complete: false,
                state: self.state()?,
            })
        }
    }
    pub fn discover(&mut self) -> Result<PlexState> {
        let secrets = self.secrets()?;
        let token = secrets
            .account
            .as_deref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let payload = self.account_request(
            Method::GET,
            "/api/v2/resources?includeHttps=1&includeRelay=0&includeIPv6=1",
            Some(token),
            &[],
        )?;
        let rows = payload
            .as_array()
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        if rows.len() > 256 {
            return Err(error(ErrorCode::ResponseTooLarge));
        }
        let mut resources = HashMap::new();
        for row in rows {
            if !row
                .get("provides")
                .and_then(Value::as_str)
                .unwrap_or("")
                .split(',')
                .any(|v| v.trim() == "server")
            {
                continue;
            }
            let id = row
                .get("clientIdentifier")
                .and_then(Value::as_str)
                .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
            identifier(id)?;
            let token = row
                .get("accessToken")
                .and_then(Value::as_str)
                .ok_or_else(|| error(ErrorCode::Unauthorized))?;
            validate_token(token)?;
            let mut targets: Vec<String> = row
                .get("connections")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|c| c.get("uri").and_then(Value::as_str))
                .filter(|u| ServerTarget::parse(u, true).is_ok())
                .take(16)
                .map(str::to_string)
                .collect();
            targets.sort_by_key(|url| !url.starts_with("https://"));
            targets.dedup();
            if targets.is_empty() {
                continue;
            }
            resources.insert(
                id.into(),
                Resource {
                    summary: ServerSummary {
                        id: id.into(),
                        name: row
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("Plex server")
                            .into(),
                        connections: targets.len(),
                    },
                    token: token.into(),
                    targets,
                },
            );
        }
        self.resources = resources;
        self.state()
    }
    fn save_selection(
        &mut self,
        selection: Selection,
        token: &str,
        libraries: Vec<MusicLibrary>,
    ) -> Result<PlexState> {
        let old = self.secrets()?;
        let next = Secrets {
            account: old.account.clone(),
            server: Some(token.into()),
        };
        self.write_secrets(&next)?;
        if self.db.set_setting(SETTINGS, &selection).is_err() {
            self.write_secrets(&old)?;
            return Err(error(ErrorCode::Storage));
        }
        self.status = if selection.library.is_some() {
            ConnectionState::Connected
        } else {
            ConnectionState::ChooseLibrary
        };
        self.selection = Some(selection);
        self.libraries = libraries;
        self.state()
    }
    pub fn select_server(&mut self, id: &str, allow_local_http: bool) -> Result<PlexState> {
        let resource = self
            .resources
            .get(id)
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let token = resource.token.clone();
        let name = resource.summary.name.clone();
        let targets = resource.targets.clone();
        let previous_library = self
            .selection
            .as_ref()
            .filter(|s| s.server_id == id)
            .and_then(|s| s.library.clone());
        let mut failure = error(ErrorCode::Unreachable);
        for url in targets.into_iter().take(4) {
            let target = match ServerTarget::parse(&url, allow_local_http) {
                Ok(t) => t,
                Err(e) => {
                    failure = e;
                    continue;
                }
            };
            let provider = PlexProvider {
                transport: self.transport.as_ref(),
                target,
                token: &token,
                client_id: &self.client_id,
                server_id: id,
            };
            let libraries = match provider
                .verify_identity()
                .and_then(|_| provider.libraries())
            {
                Ok(libs) => libs,
                Err(e) => {
                    failure = e;
                    continue;
                }
            };
            let library = previous_library
                .clone()
                .filter(|l| libraries.iter().any(|item| item.id == l.id));
            return self.save_selection(
                Selection {
                    server_id: id.into(),
                    server_name: name,
                    url: provider.target.url(),
                    allow_local_http,
                    library,
                    account: true,
                },
                &token,
                libraries,
            );
        }
        self.status = ConnectionState::Error;
        Err(failure)
    }
    pub fn manual(&mut self, url: &str, token: &str, allow_local_http: bool) -> Result<PlexState> {
        validate_token(token)?;
        let target = ServerTarget::parse(url, allow_local_http)?;
        let response = self.transport.request(
            &target,
            Method::GET,
            "/identity",
            Some(token),
            &self.client_id,
            &[],
        )?;
        let id = response
            .pointer("/MediaContainer/machineIdentifier")
            .and_then(Value::as_str)
            .ok_or_else(|| error(ErrorCode::InvalidResponse))?;
        identifier(id)?;
        let name = response
            .pointer("/MediaContainer/friendlyName")
            .and_then(Value::as_str)
            .unwrap_or("Plex server");
        let provider = PlexProvider {
            transport: self.transport.as_ref(),
            target: target.clone(),
            token,
            client_id: &self.client_id,
            server_id: id,
        };
        let libraries = provider.libraries()?;
        self.save_selection(
            Selection {
                server_id: id.into(),
                server_name: name.into(),
                url: target.url(),
                allow_local_http,
                library: None,
                account: false,
            },
            token,
            libraries,
        )
    }
    fn provider<'a>(&'a self, selection: &Selection, token: &'a str) -> Result<PlexProvider<'a>> {
        // server_id borrows self.selection, so use the stored value rather than caller data.
        let id = &self
            .selection
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?
            .server_id;
        Ok(PlexProvider {
            transport: self.transport.as_ref(),
            target: ServerTarget::parse(&selection.url, selection.allow_local_http)?,
            token,
            client_id: &self.client_id,
            server_id: id,
        })
    }
    pub fn test(&mut self) -> Result<PlexState> {
        let selection = self
            .selection
            .clone()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let secrets = self.secrets()?;
        let token = secrets
            .server
            .as_deref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let provider = self.provider(&selection, token)?;
        let result = provider
            .verify_identity()
            .and_then(|_| provider.libraries());
        match result {
            Ok(libraries) => {
                let missing = selection
                    .library
                    .as_ref()
                    .is_some_and(|l| !libraries.iter().any(|item| item.id == l.id));
                self.libraries = libraries;
                self.status = if missing {
                    ConnectionState::ChooseLibrary
                } else if selection.library.is_some() {
                    ConnectionState::Connected
                } else {
                    ConnectionState::ChooseLibrary
                };
                if missing {
                    return Err(error(ErrorCode::LibraryUnavailable));
                }
                self.state()
            }
            Err(e) => {
                self.status = ConnectionState::Error;
                Err(e)
            }
        }
    }
    pub fn reconnect(&mut self) -> Result<PlexState> {
        match self.test() {
            Ok(state) => Ok(state),
            Err(original) => {
                let selection = self
                    .selection
                    .clone()
                    .ok_or_else(|| error(ErrorCode::NotConnected))?;
                if selection.account
                    && matches!(
                        original.code,
                        ErrorCode::Unreachable | ErrorCode::Unauthorized
                    )
                    && self.discover().is_ok()
                {
                    return self.select_server(&selection.server_id, selection.allow_local_http);
                }
                Err(original)
            }
        }
    }
    pub fn select_library(&mut self, id: &str) -> Result<PlexState> {
        numeric(id)?;
        // Refresh authorization; stale or non-music library IDs cannot be persisted.
        match self.test() {
            Ok(_) => {}
            Err(e) if e.code == ErrorCode::LibraryUnavailable => {}
            Err(e) => return Err(e),
        }
        let library = self
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| error(ErrorCode::LibraryUnavailable))?;
        let mut selection = self
            .selection
            .clone()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        selection.library = Some(SelectedLibrary {
            id: library.id.clone(),
            title: library.title.clone(),
        });
        self.db
            .set_setting(SETTINGS, &selection)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.selection = Some(selection);
        self.status = ConnectionState::Connected;
        self.state()
    }
    pub fn verify_metadata(&mut self) -> Result<Verification> {
        self.test()?;
        let selection = self
            .selection
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let library = selection
            .library
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let secrets = self.secrets()?;
        let token = secrets
            .server
            .as_deref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let provider = self.provider(selection, token)?;
        Ok(Verification {
            artists: provider.metadata(&library.id, MediaKind::Artist, 0, 3)?,
            albums: provider.metadata(&library.id, MediaKind::Album, 0, 3)?,
            tracks: provider.metadata(&library.id, MediaKind::Track, 0, 3)?,
        })
    }
    pub fn disconnect(&mut self) -> Result<PlexState> {
        self.pin = None;
        self.resources.clear();
        self.libraries.clear();
        self.vault.delete(SECRETS)?;
        self.db
            .set_setting(SETTINGS, &Option::<Selection>::None)
            .map_err(|_| error(ErrorCode::Storage))?;
        self.selection = None;
        self.status = ConnectionState::Disconnected;
        self.state()
    }
}
