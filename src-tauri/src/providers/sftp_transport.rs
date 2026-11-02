use super::sftp::{
    absolute_path, error, Config, Connector, EntryKind, ErrorCode, HostKey, RemoteEntry,
    RemoteSession, Result,
};
use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine};
use ssh2::{HashType, HostKeyType, Session, Sftp};
use std::{
    net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs},
    path::Path,
    time::{Duration, Instant},
};

pub struct SshConnector;
pub fn allowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !v.is_unspecified()
                && !v.is_multicast()
                && !v.is_link_local()
                && !v.is_broadcast()
                && o[0] != 0
                && o[0] < 240
                && v != std::net::Ipv4Addr::new(100, 100, 100, 200)
        }
        IpAddr::V6(v) => {
            !v.is_unspecified()
                && !v.is_multicast()
                && !v.is_unicast_link_local()
                && v.to_ipv4_mapped().is_none()
                && v != "fd00:ec2::254".parse::<std::net::Ipv6Addr>().unwrap()
                && (v.is_loopback() || v.segments()[0] >= 0x2000)
        }
    }
}
impl Connector for SshConnector {
    fn handshake(&self, config: &Config) -> Result<Box<dyn RemoteSession>> {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let host = config.host.clone();
        let port = config.port;
        std::thread::spawn(move || {
            let result = (host.as_str(), port)
                .to_socket_addrs()
                .map(|v| v.take(16).collect::<Vec<SocketAddr>>());
            let _ = sender.send(result);
        });
        let addresses = receiver
            .recv_timeout(Duration::from_secs(4))
            .map_err(|_| error(ErrorCode::Unreachable))?
            .map_err(|_| error(ErrorCode::Unreachable))?;
        if addresses.is_empty() {
            return Err(error(ErrorCode::Unreachable));
        }
        if addresses.iter().any(|address| !allowed_ip(address.ip())) {
            return Err(error(ErrorCode::UnsafeAddress));
        }
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut socket = None;
        for address in addresses.iter().take(4) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            if let Ok(stream) =
                TcpStream::connect_timeout(address, remaining.min(Duration::from_secs(3)))
            {
                socket = Some(stream);
                break;
            }
        }
        let socket = socket.ok_or_else(|| error(ErrorCode::Unreachable))?;
        socket
            .set_read_timeout(Some(Duration::from_secs(8)))
            .map_err(|_| error(ErrorCode::Unreachable))?;
        socket
            .set_write_timeout(Some(Duration::from_secs(8)))
            .map_err(|_| error(ErrorCode::Unreachable))?;
        let mut session = Session::new().map_err(|_| error(ErrorCode::Protocol))?;
        session.method_pref(ssh2::MethodType::HostKey, "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256").map_err(|_| error(ErrorCode::Protocol))?;
        session.set_tcp_stream(socket);
        session.set_timeout(8_000);
        session
            .handshake()
            .map_err(|_| error(ErrorCode::Protocol))?;
        Ok(Box::new(SshSession {
            session,
            sftp: None,
        }))
    }
}
struct SshSession {
    session: Session,
    sftp: Option<Sftp>,
}
impl RemoteSession for SshSession {
    fn host_key(&self) -> Result<HostKey> {
        let (_, kind) = self
            .session
            .host_key()
            .ok_or_else(|| error(ErrorCode::Protocol))?;
        let algorithm = match kind {
            HostKeyType::Rsa => "ssh-rsa",
            HostKeyType::Dss => return Err(error(ErrorCode::Protocol)),
            HostKeyType::Ecdsa256 => "ecdsa-sha2-nistp256",
            HostKeyType::Ecdsa384 => "ecdsa-sha2-nistp384",
            HostKeyType::Ecdsa521 => "ecdsa-sha2-nistp521",
            HostKeyType::Ed25519 => "ssh-ed25519",
            _ => return Err(error(ErrorCode::Protocol)),
        };
        let digest = self
            .session
            .host_key_hash(HashType::Sha256)
            .ok_or_else(|| error(ErrorCode::Protocol))?;
        Ok(HostKey {
            algorithm: algorithm.into(),
            fingerprint: format!("SHA256:{}", STANDARD_NO_PAD.encode(digest)),
        })
    }
    fn authenticate(&mut self, config: &Config) -> Result<()> {
        if let Some(path) = &config.identity_file {
            let info = std::fs::metadata(path).map_err(|_| error(ErrorCode::KeyFile))?;
            if !info.is_file() || info.len() > 1024 * 1024 {
                return Err(error(ErrorCode::KeyFile));
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if info.permissions().mode() & 0o077 != 0 {
                    return Err(error(ErrorCode::KeyFile));
                }
            }
            self.session
                .userauth_pubkey_file(&config.username, None, Path::new(path), None)
                .map_err(|_| error(ErrorCode::Authentication))?;
        } else {
            let mut agent = self
                .session
                .agent()
                .map_err(|_| error(ErrorCode::Authentication))?;
            agent
                .connect()
                .map_err(|_| error(ErrorCode::Authentication))?;
            agent
                .list_identities()
                .map_err(|_| error(ErrorCode::Authentication))?;
            let identities = agent
                .identities()
                .map_err(|_| error(ErrorCode::Authentication))?;
            for identity in identities.iter().take(5) {
                if agent.userauth(&config.username, identity).is_ok() {
                    break;
                }
            }
        }
        if !self.session.authenticated() {
            return Err(error(ErrorCode::Authentication));
        }
        self.sftp = Some(
            self.session
                .sftp()
                .map_err(|_| error(ErrorCode::Protocol))?,
        );
        Ok(())
    }
    fn open(&mut self, root: &str, relative: &str) -> Result<super::sftp::RemoteFile> {
        let relative = super::sftp::relative_path(relative)?;
        if relative.is_empty() {
            return Err(error(ErrorCode::PathOutsideRoot));
        }
        let sftp = self
            .sftp
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let requested = format!("{}/{relative}", root.trim_end_matches('/'));
        // Check every component: neither leaf nor directory links are followed.
        let mut path = std::path::PathBuf::from(root);
        for part in relative.split('/') {
            if part.is_empty() {
                return Err(error(ErrorCode::PathOutsideRoot));
            }
            path.push(part);
            let info = sftp
                .lstat(&path)
                .map_err(|_| error(ErrorCode::FolderUnavailable))?;
            if info.file_type().is_symlink() {
                return Err(error(ErrorCode::PathOutsideRoot));
            }
        }
        let canonical = sftp
            .realpath(Path::new(&requested))
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        let canonical = canonical
            .to_str()
            .ok_or_else(|| error(ErrorCode::PathOutsideRoot))?;
        if !super::sftp::inside(root, canonical) {
            return Err(error(ErrorCode::PathOutsideRoot));
        }
        let mut file = sftp
            .open(Path::new(canonical))
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        let info = file
            .stat()
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        if !info.is_file() {
            return Err(error(ErrorCode::FolderUnavailable));
        }
        Ok(super::sftp::RemoteFile {
            reader: Box::new(file),
            size: info.size.unwrap_or(0),
            modified: info.mtime.unwrap_or(0),
        })
    }
    fn canonical_directory(&mut self, path: &str) -> Result<String> {
        let sftp = self
            .sftp
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let path = sftp
            .realpath(Path::new(path))
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        let stat = sftp
            .stat(&path)
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        if !stat.is_dir() {
            return Err(error(ErrorCode::FolderUnavailable));
        }
        absolute_path(
            path.to_str()
                .ok_or_else(|| error(ErrorCode::FolderUnavailable))?,
        )
    }
    fn list(&mut self, path: &str, limit: usize) -> Result<(Vec<RemoteEntry>, bool)> {
        let sftp = self
            .sftp
            .as_ref()
            .ok_or_else(|| error(ErrorCode::NotConnected))?;
        let mut directory = sftp
            .opendir(Path::new(path))
            .map_err(|_| error(ErrorCode::FolderUnavailable))?;
        let deadline = Instant::now() + Duration::from_secs(15);
        let mut entries = Vec::new();
        let mut seen = 0;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(error(ErrorCode::Unreachable));
            }
            self.session
                .set_timeout(remaining.as_millis().min(8_000).max(1) as u32);
            let (name, stat) = match directory.readdir() {
                Ok(value) => value,
                Err(e) if e.code() == ssh2::ErrorCode::Session(-16) => break,
                Err(_) => return Err(error(ErrorCode::FolderUnavailable)),
            };
            let name = name.to_str().ok_or_else(|| error(ErrorCode::Protocol))?;
            if matches!(name, "." | "..") {
                seen += 1;
                if seen > limit + 2 {
                    return Ok((entries, true));
                }
                continue;
            }
            seen += 1;
            if entries.len() == limit {
                return Ok((entries, true));
            }
            let kind = if stat.is_dir() {
                EntryKind::Directory
            } else if stat.file_type().is_symlink() {
                EntryKind::Symlink
            } else if stat.is_file() {
                EntryKind::File
            } else {
                continue;
            };
            if seen > limit + 2 {
                return Ok((entries, true));
            }
            entries.push(RemoteEntry {
                name: name.into(),
                kind,
                size: stat.size,
                modified: stat.mtime,
            });
        }
        self.session.set_timeout(8_000);
        Ok((entries, false))
    }
}
