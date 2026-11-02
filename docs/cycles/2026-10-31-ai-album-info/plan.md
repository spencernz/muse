# Steps
- [x] Add canonical remote file identities and overlapping-root dedup regression coverage.
- [x] Add schema v3 local album/track overrides and reapply them after local/SFTP indexing.
- [x] Add shared OpenAI settings/credential operations and bounded album identification/catalog/artwork transport.
- [x] Add album-level search/review/apply UI and general AI settings.
- [ ] Test credentials, dedup, parsing, sync retention and frontend flows; build and inspect.

# Validation
Native tests inject credential and network seams; no real key is required for deterministic tests. Test same-root and overlapping-root resync with preserved likes/playlists/history, distinct file paths, album override persistence after changed tags, cancel/failure and artwork bounds. Frontend mocks verify one-click album lookup, review/edit/apply, missing-key navigation and safe key settings. Run npm typecheck/lint/test, cargo fmt/test and final release build. A real billed API call requires a configured user key; do not read parent .env secrets or ask for keys in chat. Explicitly record unrun live API checks.

# Progress and decisions
Inspected actual Tauri/Rust SQLite/Rodio architecture and parent OpenAI config conventions without reading secrets. Read OpenAI Docs skill and fetched official Responses structured-output documentation; no openai-platform-api-key tool is available. Read MusicBrainz search, rate-limit and Cover Art Archive API documentation. Metadata UI must be album-level and simple; the user found manual track-based catalog matching difficult. Shared OpenAI foundation is intended for later playlist/history features, not a second player.

# Results
`cargo test --manifest-path src-tauri/Cargo.toml --quiet`: **59 passed**, 2 opt-in tests ignored. `npm test -- --reporter=dot --silent`: **79 passed**. `npm run typecheck`, `npm run lint` and `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed. Coverage includes key storage/redaction, bounded responses, exact-file alias migration, overlapping roots, source-tag override retention, preview/apply/cancel and UI flows. The opt-in public MusicBrainz/Cover Art Archive contract passed live (8 candidate releases; valid image retrieved), without an OpenAI key. No billed live OpenAI call was made. Final `npm run bundle -- --bundles app` passed: Muse.app rebuilt at **18.55 MiB**, including nonblocking current-track metadata refresh after applying catalog edits. Final native UI inspection/reload is blocked: the computer-use tool returned `cgWindowNotFound` for both Muse and Finder. Physical slider dragging, minimum-width visual checks and live AI search need verification after reopening the app and configuring a key. Existing React virtualizer warnings and upstream Rust block future-compatibility warning remain. No commit requested or created.

## Use the delivered build
1. Quit/reopen `src-tauri/target/release/bundle/macos/Muse.app`. This applies schema v3, exact-file alias repair and the volume popup fix.
2. **Settings → AI → Configure OpenAI → Save AI settings** (key stored in the OS credential store).
3. Open an album → **Search album info** → review → **Apply album info**. Artwork/metadata stay local and survive sync; music files remain unchanged.
4. Repeated Sync and overlapping roots reuse exact SSH file identities. Different files/host aliases and local-versus-remote copies are not merged solely from similar tags.

Related delivered cycles: [AirPlay](../2026-10-31-airplay/plan.md), [folder removal/dialogs](../2026-10-31-folder-removal-dialog/plan.md), [Now Playing toolbar](../2026-10-31-now-playing-toolbar/plan.md), [cloud indicators](../2026-10-31-remote-cloud-indicator/plan.md), [Settings navigation](../2026-10-31-settings-navigation/plan.md), [icon-only navigation](../2026-10-31-icon-navigation/plan.md).
