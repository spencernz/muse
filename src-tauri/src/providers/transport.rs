//! All remote I/O is native. No redirects, ambient proxies or unvalidated DNS destinations.
use super::{error, ErrorCode, Result};
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue},
    redirect::Policy,
    Method,
};
use serde_json::Value;
use std::{
    io::Read,
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    time::Duration,
};
use url::{Host, Url};

const MAX_BODY: u64 = 4 * 1024 * 1024;
#[derive(Clone)]
pub struct ServerTarget {
    pub(crate) origin: Url,
    pub(crate) allow_local_http: bool,
}
impl ServerTarget {
    pub fn parse(value: &str, allow_local_http: bool) -> Result<Self> {
        if value.len() > 2048
            || value.trim() != value
            || value.contains('\\')
            || value.contains('@')
            || value
                .bytes()
                .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
        {
            return Err(error(ErrorCode::InvalidServer));
        }
        if value
            .split_once("://")
            .and_then(|(_, rest)| rest.find('/').map(|i| &rest[i..]))
            .is_some_and(|path| path != "/")
        {
            return Err(error(ErrorCode::InvalidServer));
        }
        let origin = Url::parse(value).map_err(|_| error(ErrorCode::InvalidServer))?;
        if !matches!(origin.scheme(), "https" | "http")
            || origin.host().is_none()
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.query().is_some()
            || origin.fragment().is_some()
            || origin.path() != "/"
            || origin.port_or_known_default() == Some(0)
        {
            return Err(error(ErrorCode::InvalidServer));
        }
        if origin.scheme() == "http" && !allow_local_http {
            return Err(error(ErrorCode::InsecureConnection));
        }
        if let Some(host) = origin.host() {
            match host {
                Host::Ipv4(ip) => check_ip(IpAddr::V4(ip), origin.scheme() == "http")?,
                Host::Ipv6(ip) => check_ip(IpAddr::V6(ip), origin.scheme() == "http")?,
                _ => {}
            }
        }
        Ok(Self {
            origin,
            allow_local_http,
        })
    }
    pub fn url(&self) -> String {
        self.origin.as_str().trim_end_matches('/').to_string()
    }
}
fn local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_loopback() || ip.is_private(),
        IpAddr::V6(ip) => ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00,
    }
}
fn check_ip(ip: IpAddr, local_only: bool) -> Result<()> {
    let unsafe_ip = match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            v.is_unspecified()
                || v.is_multicast()
                || v.is_link_local()
                || v.is_broadcast()
                || o[0] == 0
                || o[0] >= 240
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 192 && o[1] == 0 && o[2] == 0)
                || o[0] == 198 && (o[1] == 18 || o[1] == 19)
        }
        IpAddr::V6(v) => {
            v.is_unspecified()
                || v.is_multicast()
                || v.is_unicast_link_local()
                || v.to_ipv4_mapped().is_some()
                || v == "fd00:ec2::254".parse::<std::net::Ipv6Addr>().unwrap()
                || (v.segments()[0] < 0x2000 && !v.is_loopback())
                || v.segments()[0] == 0x2001 && v.segments()[1] == 0x0db8
        }
    };
    if unsafe_ip || (local_only && !local(ip)) {
        Err(error(ErrorCode::UnsafeAddress))
    } else {
        Ok(())
    }
}

/// Internal seam for deterministic tests. Targets originate only from explicit setup or authenticated discovery.
pub trait Transport: Send + Sync {
    fn request(
        &self,
        target: &ServerTarget,
        method: Method,
        path: &str,
        token: Option<&str>,
        client_id: &str,
        form: &[(&str, &str)],
    ) -> Result<Value>;
}
pub struct HttpTransport;
impl Transport for HttpTransport {
    fn request(
        &self,
        target: &ServerTarget,
        method: Method,
        path: &str,
        token: Option<&str>,
        client_id: &str,
        form: &[(&str, &str)],
    ) -> Result<Value> {
        // Callers only construct fixed endpoints and numeric path segments, never server-supplied URLs.
        if !path.starts_with('/') || path.starts_with("//") || path.contains(['#', '\\']) {
            return Err(error(ErrorCode::InvalidServer));
        }
        let mut url = target
            .origin
            .join(path)
            .map_err(|_| error(ErrorCode::InvalidServer))?;
        if url.origin() != target.origin.origin() {
            return Err(error(ErrorCode::InvalidServer));
        }
        let host = target
            .origin
            .host_str()
            .ok_or_else(|| error(ErrorCode::InvalidServer))?;
        let port = target
            .origin
            .port_or_known_default()
            .ok_or_else(|| error(ErrorCode::InvalidServer))?;
        let addresses: Vec<SocketAddr> = match target.origin.host() {
            Some(Host::Ipv4(ip)) => vec![SocketAddr::new(IpAddr::V4(ip), port)],
            Some(Host::Ipv6(ip)) => vec![SocketAddr::new(IpAddr::V6(ip), port)],
            _ => {
                let host = host.to_string();
                let (sender, receiver) = std::sync::mpsc::sync_channel(1);
                std::thread::spawn(move || {
                    let result = (host.as_str(), port)
                        .to_socket_addrs()
                        .map(|v| v.take(16).collect::<Vec<_>>());
                    let _ = sender.send(result);
                });
                receiver
                    .recv_timeout(Duration::from_secs(4))
                    .map_err(|_| error(ErrorCode::Unreachable))?
                    .map_err(|_| error(ErrorCode::Unreachable))?
            }
        };
        if addresses.is_empty() {
            return Err(error(ErrorCode::Unreachable));
        }
        for address in &addresses {
            check_ip(address.ip(), target.origin.scheme() == "http")?;
        }
        if target.origin.scheme() == "http" && !target.allow_local_http {
            return Err(error(ErrorCode::InsecureConnection));
        }
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(4))
            .resolve_to_addrs(host, &addresses)
            .build()
            .map_err(|_| error(ErrorCode::Unreachable))?;
        let mut headers = HeaderMap::new();
        headers.insert("Accept", HeaderValue::from_static("application/json"));
        headers.insert("X-Plex-Product", HeaderValue::from_static("Muse"));
        headers.insert(
            "X-Plex-Version",
            HeaderValue::from_static(env!("CARGO_PKG_VERSION")),
        );
        headers.insert(
            "X-Plex-Client-Identifier",
            HeaderValue::from_str(client_id).map_err(|_| error(ErrorCode::InvalidResponse))?,
        );
        if let Some(token) = token {
            validate_token(token)?;
            let mut value =
                HeaderValue::from_str(token).map_err(|_| error(ErrorCode::Unauthorized))?;
            value.set_sensitive(true);
            headers.insert("X-Plex-Token", value);
        }
        // URL never carries credentials; even reqwest errors are replaced with static safe messages.
        url.set_fragment(None);
        let request = client.request(method, url).headers(headers);
        let response = if form.is_empty() {
            request
        } else {
            request
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(
                    url::form_urlencoded::Serializer::new(String::new())
                        .extend_pairs(form.iter().copied())
                        .finish(),
                )
        }
        .send()
        .map_err(|_| error(ErrorCode::Unreachable))?;
        match response.status().as_u16() {
            200..=299 => {}
            401 | 403 => return Err(error(ErrorCode::Unauthorized)),
            404 => return Err(error(ErrorCode::InvalidResponse)),
            300..=399 => return Err(error(ErrorCode::UnsafeAddress)),
            _ => return Err(error(ErrorCode::Unreachable)),
        }
        if response.content_length().is_some_and(|n| n > MAX_BODY) {
            return Err(error(ErrorCode::ResponseTooLarge));
        }
        let mut body = Vec::new();
        response
            .take(MAX_BODY + 1)
            .read_to_end(&mut body)
            .map_err(|_| error(ErrorCode::Unreachable))?;
        if body.len() as u64 > MAX_BODY {
            return Err(error(ErrorCode::ResponseTooLarge));
        }
        serde_json::from_slice(&body).map_err(|_| error(ErrorCode::InvalidResponse))
    }
}
pub fn validate_token(token: &str) -> Result<()> {
    if token.is_empty() || token.len() > 4096 || !token.bytes().all(|b| b.is_ascii_graphic()) {
        Err(error(ErrorCode::Unauthorized))
    } else {
        Ok(())
    }
}
