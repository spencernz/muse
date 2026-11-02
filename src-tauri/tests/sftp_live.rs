//! Opt-in live contract check. Endpoint/key details live in a private external JSON file, never this repo.
use muse_lib::{
    db::Db,
    providers::{
        sftp::{Config, SftpService},
        sftp_transport::SshConnector,
    },
};
use serde::Deserialize;
use std::sync::Arc;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveConfig {
    config: Config,
    expected_fingerprint: String,
}
#[test]
#[ignore = "requires MUSE_SFTP_LIVE_CONFIG pointing to a private connection JSON file"]
fn live_sftp_key_and_folder_check() -> Result<(), String> {
    let path = std::env::var_os("MUSE_SFTP_LIVE_CONFIG")
        .ok_or("Set the private configuration file path")?;
    let bytes = std::fs::read(path).map_err(|_| "Cannot read private live-test config")?;
    let live: LiveConfig =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid live-test config")?;
    let root = tempfile::TempDir::new().map_err(|_| "Cannot create temporary test data")?;
    let db = Db::new(root.path()).map_err(|_| "Cannot create temporary test database")?;
    let mut service = SftpService::new(db, Arc::new(SshConnector));
    let probe = service
        .connect(live.config)
        .map_err(|e| format!("Connection check: {:?}", e.code))?;
    let challenge = probe
        .challenge
        .ok_or("Expected an untrusted host challenge")?;
    if challenge.key.algorithm != "ssh-ed25519"
        || challenge.key.fingerprint != live.expected_fingerprint
    {
        return Err("Server fingerprint does not match the supplied ED25519 fingerprint; authentication was not attempted".into());
    }
    let state = service
        .confirm_host(&challenge.id)
        .map_err(|e| format!("Verified-host authentication/folder check: {:?}", e.code))?;
    let listing = state.listing.ok_or("Missing remote folder listing")?;
    println!("Verified ED25519 host identity and authenticated read-only SFTP; {} visible folder/music entries (truncated: {}).",listing.entries.len(),listing.truncated);
    if listing.entries.iter().any(|entry| {
        entry.kind == muse_lib::providers::sftp::EntryKind::Directory
            && entry.name.eq_ignore_ascii_case("music")
    }) {
        println!("A Music folder is available beneath the supplied media root.");
    }
    Ok(())
}
