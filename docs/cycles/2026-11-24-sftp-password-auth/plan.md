# Steps
- [x] Rust `sftp.rs`: `Secret` type with a redacted Debug; `Config.password_auth` / `Config.password` (never serialized); validation; password slot; global password store; `PasswordMissing` and `CredentialStore` errors; save/delete in `establish` and `disconnect`.
- [x] Rust `sftp_transport.rs`: password auth with keyboard-interactive fallback; load the saved password when the config has none.
- [x] Rust `lib.rs`: install the OS credential store. `db.rs`: ignore `passwordAuth` in the availability profile comparison.
- [x] Update Config literals in tests; add Rust tests for persistence, keyring save/delete and validation.
- [x] Frontend `sftp.ts`: types and messages. `ui/sftp.tsx`: Password option, masked field, copy updates.
- [x] Vitest: the password option submits the password and clears it; the saved-password state allows Connect without one.
- [x] README/docs/sftp.md: document password sign-in.

# Validation
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm test -- --reporter=dot`
- `make typecheck`, `make lint`
- Release build and UI inspection of the Password option at normal and narrow widths. A real password server is needed for a live check (the user).

# Progress and decisions
- The password store is a process-wide `OnceLock` installed in `lib.rs` because `SshConnector` is a unit struct used directly by playback and analysis. Tests install an in-memory store and use a distinct username per test.
- `Config.password` is never serialized, so the profile written to settings, the `remote_sources` snapshot and IPC state never contain it. Selection equality is unaffected because saved profiles never carry a password.
- Disconnect removes the password on a best-effort basis so a locked keyring cannot trap the user. Saving the password after a successful sign-in is required, and a failure is reported.
- On a failed sign-in the password stays in the field for a retry; it is cleared after success.

# Results
- `cargo test --manifest-path src-tauri/Cargo.toml`: all suites pass (4 new SFTP tests: keyring-only storage, restart reconnect and disconnect, missing/rejected password, switch to key, validation and legacy serialization).
- `npm test -- --reporter=dot`: 24 files, 142 tests pass (3 new).
- `make typecheck`, `make lint`: pass.
- `cargo fmt --check`: changed SFTP files are clean. Formatting diffs remain in untouched files (`analysis.rs`, `remote.rs` test, `tests/codecs.rs`) under the newer Rust 1.100 toolchain.
- `cargo clippy -D warnings`: no new findings. Existing findings under Rust 1.100 (in `analysis.rs`, `lyrics.rs`, `music_profiles`, `remote.rs`, and a `sftp_transport.rs` list loop) predate this change.
- `npm run bundle`: the `.deb` rebuilt successfully.
- Not verified: a live password or keyboard-interactive server (the user's NAS), and desktop UI inspection at narrow width.
