# Steps
- [x] Inspect actual architecture, models, state, settings, workflow and UI rules; explain design before code changes.
- [x] Add provider interface, local adapter, structured errors and normalized remote metadata with namespaced identities.
- [x] Add validated/pinned HTTP transport, OS credential store, Plex auth/discovery/configuration state and Tauri commands.
- [x] Add Metro Plex navigation/settings with manual setup and connection lifecycle; preserve local state/player.
- [x] Add Rust and Vitest coverage, including auth failures, metadata fallback, network restrictions and isolation.
- [x] Document setup/security/future playback design; run checks/build and inspect actual desktop UI.

# Validation
Rust provider tests use injected transport and credential storage, plus loopback HTTP fixtures for real transport policy/headers/redirects/bounds. Existing native tests protect local catalog/player behavior. Frontend Testing Library tests verify connection workflows, safe token handling, lifecycle and that Plex selection does not change local music/player state. Run cargo fmt --check, cargo test, npm run typecheck, npm run lint, npm test -- --reporter=dot and npm run bundle. Native UI inspection covers desktop/narrow where available, keyboard, loading/empty/error states, square controls and persistent full-width local player. Live account/server verification requires the user's configured Plex and will not be fabricated.

# Progress and decisions
No migrations to local music tables: use namespaced non-secret SQLite settings and OS vault entries. Reqwest is already a transitive dependency (0.13.5); add its blocking/JSON/TLS features. Add keyring with native platform features and a small system-browser opener; no web Plex SDK or audio dependency. Provider isolation is structural: separate commands, DTOs and metadata samples; no calls into Audio or writes to local tracks. Preserve pre-existing uncommitted work.

# Results
Pending.

Implementation decisions: Plex metadata pages return explicit provider artwork references; no artwork download/rendering or audio request exists in this phase. Native commands serialize connection operations. Snapshot/cancel calls wait for the current operation, preventing development StrictMode duplicate snapshot failures and lost cancellation. PIN IDs/code/expiry are validated before accepting account auth. Server identity must match authenticated account discovery; manual setup establishes its identity first. Selection commits verify music-library access and preserve the prior selection when a new connection attempt fails. Server fallback is capped at four validated candidates.

Native verification: cargo test --manifest-path src-tauri/Cargo.toml --offline passed with loopback permission (23 total tests: 13 new provider tests, 10 existing native tests). First sandbox run could not bind loopback sockets; rerun outside sandbox validated real headers/redirect/body-limit behavior. One initial test assertion expected an absent selection key after account auth; corrected it to accept the deliberately persisted null selection. No production secrets were used.

Frontend verification: npm run typecheck and npm run lint passed. npm test -- --reporter=dot passed all 56 tests across 4 files (8 new Plex UI tests). Existing virtualizer flushSync warnings remain; no new lint warnings. cargo fmt --manifest-path src-tauri/Cargo.toml --check passed. Release build and native visual inspection are in progress. Reviewed provider code for token logging/URL leakage: no console/println/debug output of credentials, secret fields have no Debug/Serialize DTO exposure, transport errors are replaced by typed/static messages and the frontend only displays code-mapped messages.

Native desktop inspection (1180px logical width, dark appearance): launched release, opened Plex in existing sidebar, confirmed Not connected/account setup/library empty state and persistent full-width local playback controls. Tested the manual form using a synthetic token and local HTTP URL with opt-in disabled: native validation rejected it before any server network request, password cleared, URL retained. Inspected square form controls and readable labels. Found offscreen error feedback after submitting the lower form; added focus and scrolling limited to #main-content so errors are visible without moving hidden ancestors. Rebuilding after this UI correction.

Final isolation correction: moved Plex initialization behind a lazy ProviderState. App setup only registers dependencies; a failure reading/writing Plex settings cannot prevent Audio or local scanning from starting. Added a native regression test for lazy initialization/locked-vault isolation. Extended real transport tests to resolve localhost through the validated/pinned DNS path and reject an oversized body without Content-Length. Both added network checks passed before the final native isolation change; full final suite and release are now running. Frontend checks remain valid (no further frontend changes).

# Final results and handoff

- `npm run typecheck`: passed on final frontend.
- `npm run lint`: passed without new warnings.
- `npm test -- --reporter=dot`: passed, 56 tests in 4 files (8 Plex UI tests).
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed after final native changes.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`: passed with loopback permission, 25 tests (14 provider integration, 1 new lazy-provider unit, 10 existing native tests).
- `npm run bundle`: final release passed; macOS Muse.app produced at src-tauri/target/release/bundle/macos/Muse.app (14.28 MiB). Existing upstream Rust block future-compatibility warning remains.
- Final native release was cleanly relaunched and rechecked at 1180px logical width, dark appearance. Plex navigation, settings entry, initial account/music-library empty states, square manual form, native keychain read with no saved credentials, cleared synthetic password, and focused/scrolled insecure-HTTP error all verified. Existing local player/track stayed present. Navigated through Music folders → Manage Plex connection and left the app on a clean Plex page with blank manual fields.
- No actual Plex sign-in, real-server connection, secure-store write/restart using a real token, or real metadata request was performed. Those checks require user-specific Plex access. Automated tests cover those contracts with injected synthetic credentials/responses. No account tokens were requested from the user or included in artifacts.
- Narrow/mobile, light-mode and Windows/Linux native visual/runtime checks remain unrun. Muse currently has only a dark appearance and a 620px native minimum width; no browser connection is available for a 320px preview. Backend/state/error behavior is automated; screenshots alone do not establish these unrun cases.
- Reviewed touched modules, commands, DTOs, documentation and credential paths for scope and accidental data. Existing local Audio/store/catalog commands are unchanged; no Plex rows enter local tables and no streaming endpoint/player was added. Whole Muse tree is pre-existing untracked work in the parent repo, so a baseline Git diff is unavailable. No staging or commits performed. Root make pre-commit checks were not run because no commit is authorized.
- Implementation is complete; cycle remains implementing pending the live account/server and remaining visual acceptance checks described above. User test path: Plex → Sign in with Plex → choose server → Connect server → choose library → Use music library → Test connection → Verify library metadata. Manual development setup is available on the same page. See docs/plex.md.
