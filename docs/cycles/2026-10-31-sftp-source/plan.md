# Steps
- [x] Inspect workflow, UI rules, provider/backend and current Plex navigation; clarify scope asynchronously.
- [x] Add SSH transport, agent/key auth, native host-key confirmation and saved SFTP state without startup I/O.
- [x] Add bounded read-only directory listing/root containment and connection lifecycle.
- [x] Add SSH/SFTP UI and settings; hide Plex without deleting its implementation/configuration.
- [x] Add regression tests and setup documentation.
- [x] Run native/frontend checks and release build, relaunch Muse and inspect desktop UI.

# Validation
Native injected-session tests verify trust-before-auth, changed-key rejection, pending challenge binding/expiry, malformed endpoints/paths, authentication failures, bounded browsing, saved-state lifecycle and local/Plex isolation. Use an isolated local SFTP fixture if available; otherwise explicitly record real-protocol/live-server coverage as unrun. Testing Library tests verify form/key selection, host trust dialog, browsing/root selection, errors/retry/disconnect, hidden Plex and unchanged local playback. Run cargo fmt --check, cargo test, npm run typecheck, npm run lint, npm test and npm run bundle. Inspect actual dark desktop/native narrow layout if controls permit; no credentials or personal file lists in saved artifacts.

# Progress and decisions
Keep existing Plex modules and IPC commands. New SFTP state initializes lazily. No host, username or key contents are needed from the user to implement the connection flow. Current tree contains extensive prior uncommitted/untracked work; no commit authorized.

# Results
Pending.

User supplied a live endpoint, username, media root and expected ED25519 fingerprint privately. Use these only for runtime setup and read-only validation; do not hardcode personal connection details into repository artifacts. No shell/sudo/server changes are authorized or needed.

Live read-only validation: used a private external JSON file (not a repo fixture) with the user-supplied endpoint/ED25519 pin. Initial agent auth failed; public-key diagnostic confirmed the agent had no identities. The default local private-key file exists with owner-only permissions. Retried through the actual native connector with that file: expected ED25519 fingerprint matched, authentication succeeded, SFTP listed the supplied media root and found a Music child. No shell commands, sudo, uploads, ownership changes or server modifications were performed. The DuckDNS account is unnecessary; the hostname already resolves to the reachable SSH endpoint. Live test only returned entry counts/existence, not personal filenames.

Frontend checks so far: npm run typecheck, npm run lint and npm test -- --reporter=dot passed (63 tests). Initial 9 new native SFTP tests passed; a challenge-binding regression assertion was extended after review so a stale nonce cannot discard the current challenge. Final native suite/build are next. Existing React virtualizer/Rust upstream warnings are retained.

Final native suite passed: cargo test --manifest-path src-tauri/Cargo.toml --offline, 34 tests plus one intentionally ignored opt-in live check. The opt-in live check was also run separately against the user-supplied server and passed with the existing private-key file; the SSH agent is empty. Native EOF/listing, ED25519 negotiation and private-key authentication therefore have real-protocol coverage, not just injected-session coverage. Initial release build passed (17.82 MiB); a small frontend trust-reset error-feedback correction and test were added before final packaging so a failed trust reset cannot hide feedback beneath a modal.

# Final validation and handoff

- npm run typecheck: passed on final frontend.
- npm run lint: passed.
- npm test -- --reporter=dot: 64 tests passed across 5 files, including 8 SFTP UI tests and preserved Plex tests. Existing virtualizer flushSync warnings remain.
- cargo fmt --manifest-path src-tauri/Cargo.toml --check: passed.
- cargo test --manifest-path src-tauri/Cargo.toml --offline: 34 native tests passed; the single opt-in live check is intentionally ignored in ordinary runs.
- The ignored live_sftp_key_and_folder_check was explicitly run using a private external configuration. It matched the user-supplied ED25519 fingerprint and passed read-only authentication/folder listing through the actual SSH2 adapter using the existing private-key file. The agent-only attempt failed because the agent has no identities; no key or server permissions were changed.
- npm run bundle: final macOS release passed (17.82 MiB) at src-tauri/target/release/bundle/macos/Muse.app. Existing upstream Rust block future-compatibility warning remains.
- Native dark desktop inspection at 1180px logical width: verified SSH/SFTP replaces Plex in navigation, form values/agent vs file selection/native key picker, and persistent full-width local playback. Native file chooser automation hit a timeout/concurrent-user-change guard; after refreshing the exact release-app binding, the user had completed connection/trust and selected a music subfolder. Preserved that working runtime selection. Final AX state and screenshot show Connected, private-key-file auth, the saved music root, readable artist-folder rows and local player intact. No personal screenshots/file lists were saved into the repo.
- Saved-configuration reconnect is covered by native/Vitest tests. A further automated app restart was not forced after the user configured the live connection, to avoid interrupting their active session. Actual narrow/mobile, Windows/Linux and light-mode visual checks remain unrun; Muse is dark-only with a 620px native minimum, and no connected browser is available for 320px inspection.
- Reviewed new modules/commands/docs and token/private-key paths for scope. New production SFTP code exposes no shell, sudo, writes or forwarding. Plex code, internal route, commands, tests and saved credentials remain; only its navigation/settings entry is hidden. Private connection details were used only in the external runtime test and native app settings, not committed fixtures. The temporary external test config was removed after use.
- No staging or commits; repository-wide pre-commit make checks were not required because no commit was authorized. Whole Muse tree was already untracked in the parent repo, so a baseline Git diff is unavailable.
- This phase connects and browses folders only. Home/Library/Songs and the bottom player remain local. Remote music indexing/download/playback is deferred, consistent with the stated first-phase scope.
