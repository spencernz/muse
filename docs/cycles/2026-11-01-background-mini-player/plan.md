# Steps
- [x] Native mini-window lifecycle, activation routing and main restore.
- [x] Compact UI with existing state/transport/favourite APIs.
- [x] Focused tests, native compile/checks and final release build with collage and fullscreen close fixes.
# Validation
Component tests cover current track, transport/favourite calls and restore/dismiss. Native lifecycle tests retain fullscreen pending guard. Typecheck/lint and affected native/frontend tests; record actual native visual limitations.
# Progress and decisions
Existing tray left click and macOS Reopen always show full main window. Existing bootstrap/event subscribers share one backend audio state and can serve companion UI without a second player. Background-close transition fix already in progress.
# Results
Pending.

# Final checks and packaging
- `npm run typecheck` and `npm run lint`: passed, no warnings.
- `npm test`: 97 passed across 13 files. New coverage includes unique/single-slot cover rotation, hover pause, native transport/favourite and mini restore/dismiss calls, artist-album navigation. Updated the prior Home AI test to match the already-approved direct generation behavior.
- `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: 73 passed, two opt-in live tests ignored. Local test HTTP fixtures required sandbox escalation.
- Native source check: tao 0.37.1 clears fullscreen state and emits resize from `windowDidExitFullScreen`; background hide waits for that state/event rather than a delay.
- `cua.getState()` again failed with “Sky Computer Use native pipe startup failed.” Real desktop/minimum-width visuals and OS fullscreen/Dock interactions remain pending; unit tests do not establish physical UI correctness.
- User authorized rebuilding/replacing/relaunching current app. Running process is the release bundle at `src-tauri/target/release/bundle/macos/Muse.app`; no separate /Applications copy exists.
- Final `npm run bundle -- --bundles app` passed: 18.74 MiB. Applied local ad-hoc bundle signing (Tauri initially only had its linker signature); `codesign --verify --deep --strict` passed. Old Muse process was terminated with the user-authorized restart, then the exact rebuilt bundle was opened successfully. No commit requested or made.

- [ ] Physical visual/OS interaction signoff remains pending because computer-use service cannot start. All requested code changes and the replacement/relaunch are complete.

# Icon anchor/artwork follow-up
- [x] Pass native tray click rectangle into popup positioning; monitor/work-area clamp and above fallback.
- [x] Add clipped album-art blur and keep controls readable.
- [x] Test monitor-edge placement and art changes; rebuild/relaunch current release.
Validation: pure physical-coordinate positioning cases (top/right, bottom, negative-origin monitor), focused component test for cover changes/missing artwork, existing mini control tests, typecheck/lint/native tests. Actual native inspection remains pending if service cannot start.

Dock correction: macOS Reopen now calls `desktop::show` directly, which hides mini player, cancels a pending background hide, restores/unminimizes and focuses main. Tray icon click alone invokes anchored compact UI.

Follow-up native `cargo test --manifest-path src-tauri/Cargo.toml --lib desktop --quiet`: 3 passed, including new physical-coordinate positioning cases for top/right/bottom/negative-origin Retina displays. Frontend artwork and no-art tests pass. Native inspection retried and still fails with native pipe startup failure. Build/relaunch results pending.

## Final follow-up build
- `npm run typecheck`, `npm run lint`, `npm test`: passed, 99 frontend tests across 13 files.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib desktop --quiet`: 3 passed (lifecycle, placement, preferences).
- `npm run bundle -- --bundles app`: passed, Muse.app 18.75 MiB. Local ad-hoc bundle signature applied and `codesign --verify --deep --strict` passed.
- Replaced the existing release bundle and relaunched it using the user's existing authorization; confirmed a new Muse process at the exact release path.
- Native visual inspection remains blocked by pipe startup failure. In particular menu-bar top-edge reveal and physical icon anchoring are not visually verified. Explicit fullscreen Exit action is covered by tests; user OS hover behavior remains an open verification item.
- Dock now always restores full Muse. Only tray/menu-bar click opens the compact window.
