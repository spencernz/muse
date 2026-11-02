# Status
Implementing: implementation, automated checks, live read-only SFTP and desktop inspection complete; remaining narrow/platform checks are recorded in the plan.

# Problem and outcome
Connect Muse directly to the friend's SSH/SFTP music server using the user's existing SSH key, replacing the visible Plex login flow. Preserve the Plex implementation and saved configuration, hidden from navigation/settings as explicitly requested.

# Scope
SSH/SFTP connection settings (host, port, username, remote music folder, SSH agent or native-selected private-key file), explicit host-fingerprint verification before authentication, bounded read-only remote folder browsing/selection, saved connection, test/reconnect/disconnect, actionable errors and tests. Use native Rust and the existing provider architecture/Metro UI. Existing local catalog/player stay unchanged. Continue the prior Phase 1 scope: remote streaming/download/playback and remote tag extraction are deferred unless the user selects the expanded scope. No remote writes, shell commands, Plex deletion or edits to the user's SSH configuration/known_hosts/private keys.

# Acceptance criteria
- Sidebar/settings expose SSH/SFTP in place of Plex; Plex code, tests, commands and credentials remain intact and can be re-enabled later.
- User can enter a validated host/port/username/root and authenticate with their existing agent or an explicitly selected key file. Native file selection avoids sending private-key contents or passphrases through IPC. No passwords/private keys are stored in Muse's database or logged.
- New server keys require a reviewable SHA256 fingerprint and explicit trust before authentication. Reconnect checks saved trust on every handshake; changed keys fail closed. Trust confirmation is bound to the exact pending endpoint/fingerprint and expires; a changed key during confirmation never receives credentials. Trust reset is an explicit user action and affects only Muse's records.
- Connection configuration and accepted host fingerprint survive restart; provider errors do not block local startup. Test/reconnect refreshes the remote root, disconnect closes sessions/clears the saved connection while retaining host trust.
- Remote browsing is read-only and confined to the canonical selected root. Reject traversal, unsafe destinations, oversized/malformed paths, symlink escapes and unbounded directory/network operations. No remote shell/URL proxy is exposed.
- Users can navigate directories, see supported music filenames/file sizes, choose a music subfolder, and recover from empty/inaccessible folders and lost connections. Browsing does not modify local tracks, queue, playback or Plex settings.
- Rust/Vitest cover host trust and key changes, authentication/network errors, path containment, persistence, lifecycle and provider isolation. Checks/build pass; record actual native UI inspection and the lack of real friend-server verification.

# Decisions and open questions
User explicitly says hide Plex rather than remove it. Use libssh2 through the small ssh2 Rust wrapper for structured SFTP, avoiding shell-command construction and parsing human-readable OpenSSH output. Agent authentication is the default; encrypted file keys should be unlocked in the agent, so Muse does not collect passphrases. Host trust is app-scoped SQLite non-secret data, distinct from authorized_keys/user private keys. Existing dark English UI and square control styling are preserved. The user later supplied live connection details and an expected ED25519 fingerprint privately. Runtime validation matched that fingerprint and authenticated using the existing owner-only private-key file; details remain outside repository fixtures. Do not expose key contents or hardcode personal endpoints. Scope question was asked asynchronously; proceed with connection/folder browsing aligned to the prior Phase 1 implementation until directed otherwise. No commit requested.

# Sources
- https://docs.rs/ssh2/latest/ssh2/struct.Session.html
- https://docs.rs/ssh2/latest/ssh2/struct.Sftp.html
- https://docs.rs/ssh2/latest/ssh2/struct.File.html
