# SSH / SFTP music source

Muse's visible remote-source setup uses SSH/SFTP. Plex is hidden from settings, but its implementation, internal route, tests, commands and stored connection are retained. Local music and the full-width native playback bar are unchanged.

Muse connects and verifies an SSH server, saves a chosen music folder, syncs its metadata into the catalog, and streams its tracks through the existing native player. Only metadata and artwork are stored on your Mac. Audio stays on the server; there is no offline download or mirrored music folder.

## Connect

1. Open **Settings → Remote music → Manage SSH / SFTP**.
2. Enter the real hostname (without `ssh://`), SSH port, remote username and an absolute remote folder path. Obtain these from the server owner. DuckDNS provides a hostname; its account credentials are not SSH credentials and are not needed by Muse.
3. Choose **SSH agent** if your key is already loaded/unlocked. Otherwise choose **Private key file → Choose private key** and select the private key matching the public key installed on the server. Files ending in `.pub` are not private keys.
4. Choose **Connect SSH**. On first use, compare the displayed ED25519/SHA256 fingerprint against one obtained from the server owner through a trusted channel. Check **I verified this fingerprint with the server owner**, then **Trust and connect**. Muse prefers ED25519 when negotiating host keys.
5. Open subfolders in **Remote music folder**. **Up one folder** stays within the initially selected root. Choose **Use this music folder** to save and restrict the connection to that subfolder.

A saved connection loads as configured after restart until **Reconnect** or **Test connection** verifies the server again. **Refresh folder** updates the listing. Empty folders and truncated listings are identified explicitly. Only the first 500 raw directory entries are read/displayed at a time; select a smaller root/subfolder when needed. Symlinks are shown but not followed by the UI. Paths resolved outside the chosen root are rejected.

**Disconnect SSH** closes the active session and clears Muse's saved SFTP profile; public server trust remains. It never edits/deletes local private keys, the user's SSH configuration/known_hosts, remote files or Plex settings.

## Keys and authentication

No key contents or passphrases are requested by the UI, stored in SQLite/localStorage, returned over IPC or logged. A selected private key's file path is stored as a connection preference and read only by the native SSH library. File keys must be readable regular files, no larger than one MiB, and on Unix must have owner-only permissions. Encrypted file keys should be unlocked in the SSH agent rather than supplying a passphrase to Muse.

On macOS, loading an existing key into your agent normally uses:

```sh
ssh-add ~/.ssh/id_ed25519
ssh-add -l
```

Enter any key passphrase in your own Terminal. Do not paste it or the private-key contents into chat. The agent is tried with up to five loaded identities; if there are many unrelated identities or authentication fails, select the matching key file or arrange the agent identities in your own SSH setup. Muse uses direct SSH connections rather than reading aliases, ProxyJump/ProxyCommand, or options from `~/.ssh/config`.

Authentication failure can mean an empty/locked agent, the wrong username/key, or a public key missing from the account's `authorized_keys`. A readable SSH account does not automatically have read access to the media mount; ask the owner to grant appropriate read/traverse permissions. Muse never requests sudo or runs a remote shell to bypass permissions.

## Host verification and network policy

First contact only performs the SSH handshake and obtains the public server key. Authentication starts after explicit confirmation, using a fresh handshake whose key must still match the confirmed fingerprint. The challenge is bound to a random one-use ID, exact host/port/config and a five-minute expiry. Cancelled/replaced/stale challenges cannot authorize a different connection.

Every reconnect checks the app-scoped accepted fingerprint before authentication. A changed key fails closed. **Review changed server key** shows old/new fingerprints; only after verifying with the owner should you check the review box and **Forget old server key**, then connect and verify the new key. No automatic trust replacement occurs. Public trust is stored in `providers.sftp.trusted_hosts`; non-secret host/port/username/root/key-file path are stored in `providers.sftp.profile` in Muse's SQLite settings. Corrupt/unavailable trust storage fails closed.

Hostnames, ports, usernames, key paths and POSIX remote paths are validated. DNS answers are checked before connecting directly to the resolved IP. Link-local/known cloud metadata, unspecified, multicast and mapped IPv6 destinations are rejected. LAN/loopback, public and tailnet/CGNAT addresses are supported apart from known metadata endpoints. There are no proxy, port forwarding, shell execution or remote write commands in the module.

DNS lookup is bounded to four seconds, TCP connection attempts share an eight-second budget, and blocking SSH calls have an eight-second timeout. Directory traversal has a fifteen-second budget and an entry cap. Native work runs outside the UI thread; duplicate operations are serialized/rejected. New provider state is registered without startup I/O and reads settings lazily, so SSH failures do not prevent local music startup.

## Development validation

```sh
npm run typecheck
npm run lint
npm test -- --reporter=dot
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --offline
npm run bundle
```

Native tests inject a connector/session to verify trust-before-auth, key changes, challenge cancellation/binding, errors, path containment, persistence, root selection and isolation from local/Plex data. Frontend tests cover key selection, explicit trust, browsing, root choice, reconnect/disconnect, safe feedback and hidden Plex navigation.

An opt-in real-protocol check is available in `tests/sftp_live.rs`. Set `MUSE_SFTP_LIVE_CONFIG` to a private external JSON file containing `config` (host, port, username, root, identityFile) and `expectedFingerprint`, then explicitly run the ignored test. It creates an isolated temporary database, verifies the expected ED25519 fingerprint before authentication, and reads only the configured folder. Personal endpoints/keys must never be hardcoded into test fixtures or committed.

## Sync and remote playback

1. Browse to the music folder and choose **Use this music folder**. Sync always uses the saved root shown above the Sync button, not a folder you are merely browsing.
2. Choose **Sync catalog**. Muse reads supported files recursively and shows progress. **Cancel Sync** keeps the previous catalog. Folder selection and connection changes are disabled on this page during a sync.
3. Choose **Open library**. Remote album and player covers show a small cloud icon with a **Remote music (SSH)** tooltip. Track rows use the same clean layout as local songs. Local music stays in the same library and uses its original file path.
4. Play, pause, seek, queue and change volume with the existing controls. A new SFTP connection verifies the saved host key before opening a remote track. Switching or disconnecting the saved SSH source stops remote playback; use **Reconnect** and play again after a network failure. Restored remote queues remain paused and make no startup network request.

Sync uses source-scoped IDs and separate remote location records; local rescans cannot mark remote files missing. Repeated Sync skips tag reads for unchanged size/modification time. A successful scan marks removed files unavailable while retaining favourites, playlists and history. Failed, cancelled or truncated scans do not publish a partial catalog. Unreadable/unsupported tags are counted; existing tags for those paths are retained. Select a smaller root if a scan hits limits: 500 entries per directory, 2,000 directories, depth 32, 10,000 music files. Each tag read has a 24 MiB transfer budget; large/unsupported tag layouts may be skipped. Symlinks are not followed. The server account must have read/traverse access.

Streaming uses a seekable SFTP reader and background decoding into a bounded PCM queue (16 × 8,192 samples plus one pending chunk, about 544 KiB), with a 128 KiB compressed input buffer. The audio callback never waits for network data; temporary underruns output silence without advancing the track clock. Seeking discards old buffered audio. Network/seek failures stop playback with retry guidance. No audio file, private key, password or token is returned to the webview or written to the music library/cache. Formats use the same native decoder as local music; no transcoding is performed. This phase does not support simultaneous browsing/playback across multiple saved servers.

The additive SQLite version 3 migration preserves local tables, metadata and preferences, adds exact remote file identities across overlapping roots and retains local album-info overrides. Older Muse binaries reject this catalog instead of silently dropping remote support. Do not launch an old bundle against the migrated app data.

References: [ssh2 Session](https://docs.rs/ssh2/latest/ssh2/struct.Session.html), [SFTP](https://docs.rs/ssh2/latest/ssh2/struct.Sftp.html).
