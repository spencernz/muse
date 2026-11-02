# Steps
- [x] Add testable output-device registry and native commands using existing CPAL.
- [x] Route the existing audio engine transactionally, retaining queue/position/state and reporting device errors.
- [x] Add shared output dialog/buttons to the footer and Now Playing using Metro controls.
- [x] Test selection, stale devices, errors, focus and provider/player isolation.
- [ ] Build and inspect the desktop application; document AirPlay setup and verification limits.

# Validation
Use synthetic device registries for refresh/identity/stale selection and failure policies, frontend mocks for picker loading/select/error/refresh/keyboard behavior, existing native/local/SFTP tests for regressions, npm typecheck/lint/test/build, cargo fmt/test and release app build. Inspect desktop/narrow if available. Enumerate actual native outputs read-only; do not claim receiver delivery without hardware verification or change the Mac's global output.

# Progress and decisions
Inspected the actual React/Zustand/Tauri application, Rodio 0.21.1 and its CPAL 0.16 Core Audio implementation. CPAL uses Apple's DefaultOutput AudioUnit for system-default playback, which follows macOS routing; explicit devices use HAL output. Apple documents AirPlay output selection through Control Center/Sound. AVRoutePickerView routes an AVPlayer and cannot replace Muse's PCM output directly. The implementation will expose OS-registered devices and a fixed Sound settings link. No schema migration or credentials needed. A persistent stereo mixer now owns the existing sink; hardware streams consume that same mixer through generation-gated, nonblocking readers. Switching output therefore retains the exact decoder (including an active SFTP session), sink, position and queue instead of reloading/seeking music. Readers hand off whole frames to preserve stereo alignment.

# Results
Native output registry/handoff/contention tests passed; frontend output-picker tests passed. Final combined checks/build and actual UI/device inspection pending. Native desktop picker was inspected at 1180×800 CSS px: it enumerated MacBook Air Speakers and showed the system-default selection and pairing guidance; dialog was centred with visible focus. No physical AirPlay receiver has been verified. The concurrent folder-removal/shared-dialog fix will ship in the same rebuilt app.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.
