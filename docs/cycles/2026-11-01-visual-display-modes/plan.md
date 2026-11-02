# Steps
- [x] Read workflow/UI rules and inspect Now Playing layout, visual engine lifecycle and native fullscreen controls.
- [x] Add width state/layout and compact visual actions.
- [x] Add top-layer fullscreen presentation with native ownership/race-safe restoration and focus/Escape handling.
- [x] Test width/fullscreen behavior without audio recreation, entry failures/races and pre-existing native fullscreen.
- [x] Run frontend/native checks, build/sign/relaunch and attempt native UI inspection.
- [ ] Physically verify desktop/narrow layouts and native fullscreen transitions when the UI service is available.
# Validation
Component tests exercise actual controls/parent width classes and preservation of engine subscription; service tests control native promises and prior-state ownership. Native compilation/tests verify command registration and no playback regressions. Full frontend tests, lint/typecheck and Tauri release build. Actual desktop/narrow/native transition inspection attempted via available UI tools.
# Progress and decisions
Wide layout changes only apply while the Visual Effects tab is selected. Fullscreen is a temporary display state, not a persisted setting. Existing effect/theme/intensity/shuffle preferences stay intact.
# Results
- `npm test`: 124 passed. New coverage verifies parent width/artwork restoration across tabs, unchanged engine/audio subscription through fullscreen, Close/Escape/focus restoration, pre-existing native fullscreen ownership, close during pending entry, entry failure rollback and retry after native exit failure.
- `npm run typecheck`, `npm run lint`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 80 passed, 2 ignored live-network tests.
- Native `enter_fullscreen` waits for confirmed native entry on a worker before resolving, so immediate Close can serialize its exit after the macOS transition. Timeout is bounded to five seconds. Existing native fullscreen menu/titlebar handling is reused.
- UI inventory retry: no apps/browsers; `Sky Computer Use native pipe startup failed`. Actual desktop/narrow sizing, native focus trap, menu-bar transitions and canvas continuity during physical fullscreen animations remain unverified. Browser dialog behavior is simulated in component tests; tests do not establish visual correctness.
- `npm run bundle -- --bundles app`: passed (18.83 MiB). Ad-hoc signed as `local.muse.player`; `codesign --verify --deep --strict` passed. Previous Muse process terminated and exact release bundle reopened. No playback/audio/provider changes, dependencies or commit.
Cycle remains implementing pending native visual acceptance.

User also asked why Sonos appears in Apple Music but not Muse. Read-only inspection confirmed existing `Outputs::refresh` enumerates CPAL/CoreAudio output devices; it is not a native AirPlay discovery picker. Explained the Control Center → Sound workaround followed by explicitly applying System default in Muse. No AirPlay changes included in this cycle.
