# Steps
- [x] Inspect native close path and installed macOS window-library transition code.
- [x] Defer background hide to completed fullscreen exit and cancel on restore.
- [x] Test lifecycle guard, compile and rebuild with playlist collages.
# Validation
Unit-test pending hide guard across still-fullscreen/completed/repeated/cancelled sequences; native checks. Actual red-button fullscreen close must be verified on macOS when native inspection returns. Do not claim the OS animation is tested by unit tests.
# Progress and decisions
Source shows immediate window.hide on background close. App’s custom Now Playing X only navigates internally. Awaiting optional clarification while fixing the native lifecycle evidence.
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

# Fullscreen top-bar follow-up
Hypotheses: overlay/fullsize-content interaction; OS menu-bar preference/presentation state; user means immersive Now Playing instead of native fullscreen. Asked clarification. Installed tao only forces hidden menu in Exclusive fullscreen, while green-button entry is Borderless; historical tao issue #188 was closed years ago and is not proof of current cause. Avoid process-global AppKit presentation changes or invasive dependency patches. Restore native title-bar space only during fullscreen and expose a supported explicit Exit fullscreen action. Actual hover verification remains pending because native computer-use startup fails.
- [x] Synchronize native fullscreen state and title-bar mode on completed transitions.
- [x] Expose an Exit fullscreen control without requiring Escape.
- [x] Test fullscreen control visibility/action and rebuild/relaunch combined changes.

Native resize event synchronizes fullscreen state, switches macOS title-bar Overlay → Transparent only in fullscreen, and restores Overlay on exit. Frontend exposes native Exit fullscreen independent of the in-app Now Playing X. New test covers the explicit button/action. Hover/menu reveal is still not physically verified; native inspection unavailable.

## Final follow-up build
- `npm run typecheck`, `npm run lint`, `npm test`: passed, 99 frontend tests across 13 files.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib desktop --quiet`: 3 passed (lifecycle, placement, preferences).
- `npm run bundle -- --bundles app`: passed, Muse.app 18.75 MiB. Local ad-hoc bundle signature applied and `codesign --verify --deep --strict` passed.
- Replaced the existing release bundle and relaunched it using the user's existing authorization; confirmed a new Muse process at the exact release path.
- Native visual inspection remains blocked by pipe startup failure. In particular menu-bar top-edge reveal and physical icon anchoring are not visually verified. Explicit fullscreen Exit action is covered by tests; user OS hover behavior remains an open verification item.
- Dock now always restores full Muse. Only tray/menu-bar click opens the compact window.

# Current diagnosis and correction
Confirmed static alignment defect: root-fixed Exit at top=8/size=40 versus main-area-absolute Now Playing X at top=16/size=48. Use one parent flex toolbar.
Native inspection retried after resetting CUA session; still fails with native pipe startup error. Global menu preference keys are unset. This prevents an agent-run physical hover loop; explicitly retain that verification gap rather than infer a confirmed OS cause. Apple AppKit documentation distinguishes HideMenuBar (unavailable) from AutoHideMenuBar (reveals near mouse) and requires a compatible Dock option. Enforce this documented app-scoped fullscreen policy and restore previous options on exit; test conflicting-flag sanitization. Reference: https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct/autohidemenubar
- [x] Regression for shared controls toolbar and AppKit policy before corrections.
- [x] Shared toolbar + fullscreen presentation policy, compile/check and rebuild/relaunch.
- [ ] Physical menu reveal confirmation; unavailable native inspection means this stays pending.

Regression results: before correction the AppKit option-policy test failed because HideMenuBar remained set, and the shared-row UI test failed because no Window controls parent existed. Both passed after correction. These validate policy and layout structure, not physical OS hover.
Implementation captures windowed AppKit options before fullscreen, removes mutually exclusive hard-hide flags, requests AutoHideMenuBar + AutoHideDock, rechecks on native resize completion, and restores prior app options on exit. No global defaults are written. objc2 0.6/AppKit 0.3 were already transitive Tauri dependencies; direct declarations build offline.

Current checks: `npm run typecheck`, `npm run lint`, `npm test` pass; 100 frontend tests across 13 files. `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib mac_fullscreen --quiet` passes the new policy regression. Final native unit run and release build are running. Native controls share a flex toolbar in Now Playing, each 48px with transparent rest state. Exit joins content-navigation tools outside Now Playing, avoiding a floating control overlapping page actions.

## Aligned-controls/native-reveal release
- `npm run typecheck`, `npm run lint`, `npm test`: passed; 100 frontend tests across 13 files.
- `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib --quiet`: 41 passed, one live test ignored. `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `npm run bundle -- --bundles app`: passed, 18.75 MiB. Applied ad-hoc bundle signature and verified with `codesign --verify --deep --strict`.
- Replaced the existing release bundle, terminated the old Muse process and opened the exact rebuilt app under the user's existing authorization; confirmed a new running process.
- Alignment regression and AppKit flag-policy regressions were observed red before fixes and green after. No runtime/temporary debug instrumentation added. App-scoped windowed presentation options are captured before fullscreen and restored on exit; compatible auto-hide flags are applied on fullscreen resize, with unchanged requests avoided unless system options remain hard-hidden.
- Actual menu-bar reveal remains unverified because native computer-use fails to start, including after kernel reset/new session. User confirmation at the physical screen edge remains required to establish this OS symptom is resolved. No claim that a historical upstream bug establishes the current root cause.
- No commit requested or created.
