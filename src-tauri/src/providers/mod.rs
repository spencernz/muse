//! Provider adapters resolve explicit source identities. SFTP sync publishes normalized
//! tracks with separate remote locations; every source shares the existing native audio queue.
pub mod commands;
pub mod credentials;
pub mod metadata;
pub mod plex;
pub mod remote;
pub mod sftp;
pub mod sftp_commands;
pub mod sftp_transport;
pub mod transport;

use crate::{
    db::Db,
    models::{Album, Facet, Track, TrackQuery},
};
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidServer,
    InsecureConnection,
    UnsafeAddress,
    Unreachable,
    Unauthorized,
    InvalidResponse,
    ResponseTooLarge,
    CredentialStore,
    NotConnected,
    SignInExpired,
    SignInCancelled,
    Busy,
    LibraryUnavailable,
    Storage,
    Browser,
}
#[derive(Clone, Debug, Serialize)]
pub struct ProviderError {
    pub code: ErrorCode,
    pub message: &'static str,
}
pub type Result<T> = std::result::Result<T, ProviderError>;
pub fn error(code: ErrorCode) -> ProviderError {
    use ErrorCode::*;
    ProviderError { code, message: match code {
        InvalidServer => "Enter a server origin such as https://plex.example.com:32400, without a path, credentials or query.",
        InsecureConnection => "Use HTTPS, or explicitly allow HTTP for a local development server.",
        UnsafeAddress => "This address is not an allowed Plex server destination.",
        Unreachable => "Could not reach Plex. Check the server, network and TLS certificate, then reconnect.",
        Unauthorized => "Plex rejected the saved credentials. Sign in again or replace the manual token.",
        InvalidResponse => "Plex returned an unexpected response. Check that this is a Plex Media Server.",
        ResponseTooLarge => "Plex returned too much data. Try again with a smaller library request.",
        CredentialStore => "Muse could not access the system credential store. Unlock it and retry; credentials were not saved as plaintext.",
        NotConnected => "Connect Plex and select a music library first.",
        SignInExpired => "Plex sign-in expired. Start signing in again.",
        SignInCancelled => "This sign-in is no longer active. Start signing in again.",
        Busy => "A Plex operation is already running. Wait for it to finish.",
        LibraryUnavailable => "The selected music library is no longer available. Choose a music library again.",
        Storage => "Muse could not save the Plex selection. Check the app data folder and retry.",
        Browser => "Muse could not open your browser. Retry opening Plex sign-in.",
    }}
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub metadata: bool,
    pub playback: bool,
}
pub fn descriptors() -> Vec<ProviderDescriptor> {
    vec![
        ProviderDescriptor {
            id: "local",
            name: "Local music",
            metadata: true,
            playback: true,
        },
        ProviderDescriptor {
            id: "sftp",
            name: "SSH / SFTP",
            metadata: false,
            playback: false,
        },
        ProviderDescriptor {
            id: "plex",
            name: "Plex",
            metadata: true,
            playback: false,
        },
    ]
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicLibrary {
    pub id: String,
    pub title: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaKind {
    Artist,
    Album,
    Track,
}
impl MediaKind {
    pub fn plex_type(self) -> u8 {
        match self {
            Self::Artist => 8,
            Self::Album => 9,
            Self::Track => 10,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "provider", rename_all = "camelCase")]
pub enum ArtworkRef {
    Local {
        path: String,
    },
    Plex {
        #[serde(rename = "serverId")]
        server_id: String,
        key: String,
    },
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MetadataItem {
    Artist {
        id: String,
        artist: Facet,
        artwork: Option<ArtworkRef>,
    },
    Album {
        album: Album,
        artwork: Option<ArtworkRef>,
    },
    Track {
        track: Track,
        artwork: Option<ArtworkRef>,
    },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPage {
    pub provider_id: &'static str,
    pub offset: usize,
    pub total: usize,
    pub items: Vec<MetadataItem>,
}

/// A read-only seam: adapters cannot enqueue audio or modify another provider's catalog.
pub trait MusicProvider {
    fn libraries(&self) -> Result<Vec<MusicLibrary>>;
    fn metadata(
        &self,
        library: &str,
        kind: MediaKind,
        offset: usize,
        limit: usize,
    ) -> Result<MetadataPage>;
}

pub struct LocalProvider(pub Db);
impl MusicProvider for LocalProvider {
    fn libraries(&self) -> Result<Vec<MusicLibrary>> {
        Ok(vec![MusicLibrary {
            id: "local".into(),
            title: "Local music".into(),
        }])
    }
    fn metadata(
        &self,
        library: &str,
        kind: MediaKind,
        offset: usize,
        limit: usize,
    ) -> Result<MetadataPage> {
        if library != "local" {
            return Err(error(ErrorCode::LibraryUnavailable));
        }
        let limit = limit.clamp(1, 25);
        let local_art =
            |cover: &Option<String>| cover.clone().map(|path| ArtworkRef::Local { path });
        let (total, items) = match kind {
            MediaKind::Artist => {
                let all = self
                    .0
                    .library()
                    .map_err(|_| error(ErrorCode::Storage))?
                    .artists;
                (
                    all.len(),
                    all.into_iter()
                        .skip(offset)
                        .take(limit)
                        .map(|artist| MetadataItem::Artist {
                            id: format!("local:artist:{}", artist.name),
                            artwork: local_art(&artist.cover),
                            artist,
                        })
                        .collect(),
                )
            }
            MediaKind::Album => {
                let all = self
                    .0
                    .library()
                    .map_err(|_| error(ErrorCode::Storage))?
                    .albums;
                (
                    all.len(),
                    all.into_iter()
                        .skip(offset)
                        .take(limit)
                        .map(|album| MetadataItem::Album {
                            artwork: local_art(&album.cover),
                            album,
                        })
                        .collect(),
                )
            }
            MediaKind::Track => {
                let page = self
                    .0
                    .tracks(&TrackQuery {
                        offset,
                        limit,
                        ..Default::default()
                    })
                    .map_err(|_| error(ErrorCode::Storage))?;
                (
                    page.total,
                    page.items
                        .into_iter()
                        .map(|track| MetadataItem::Track {
                            artwork: local_art(&track.cover),
                            track,
                        })
                        .collect(),
                )
            }
        };
        Ok(MetadataPage {
            provider_id: "local",
            offset,
            total,
            items,
        })
    }
}
