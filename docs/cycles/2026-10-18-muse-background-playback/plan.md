# Steps
- [x] Inspect Tauri 2.12 lifecycle, native Rodio engine, media controls, settings and official tray/notification APIs.
- [x] Add native preferences, tray, close/hide/restore and exit persistence with one-time notification.
- [x] Add accessible Metro setting and error handling; regression coverage for persistence/lifecycle decisions and UI.
- [x] Build and test native close, hidden progress/queue advancement, restore, tray transport, explicit quit and preference retention.
- [x] Run frontend/Rust tests, root checks and production bundle; record actual platform limits.

# Validation
Use isolated QA bundle/catalog and silent native WAV fixtures. Compare native persisted playback while hidden, restore same process/window, verify transport and close-to-quit. Exercise >5 minute hidden playback if available. Run `cargo test`, `npm test`, `make typecheck`, `make lint`, `npm run bundle`. Inspect settings at desktop and narrow widths. No Windows/Linux runtime is available here; report those checks unrun.

# Progress and decisions
Narrow native inspection found macOS select chrome rounds the control and clips its long label. Use a labelled native radio group with square CSS controls and wrapping option labels instead; preserve native keyboard and screen-reader semantics.
Official references: https://v2.tauri.app/learn/system-tray/ and https://v2.tauri.app/plugin/notification/. Native audio thread already handles OS media events and publishes state every 200ms, saves every 10 seconds. Add the official single-instance plugin before other plugins so relaunching restores the existing engine/window instead of creating a second process. Preserve that engine; tray sends the same commands. Restore publishes a fresh native snapshot.

# Results
- `npm test`: 25 passed (including load/save error recovery and unavailable tray state).
- `cargo test --offline`: 10 passed, doc-tests passed. A concurrent early bundle/test run invalidated rustdoc artifacts; reran sequentially and passed. Keep native builds sequential.
- Root `make typecheck` and `make lint`: passed.
- `cargo clippy --offline --all-targets -- -D warnings`: passed on final native code.
- `npm run bundle`: successful production macOS bundle (10.93 MiB).
- Native 1180×800 initial settings inspection and final 320×800 / 1710×995 radio-group inspection: readable square controls with full wrapping labels, keyboard focus, both choices, connected media controls; saved background preference survives relaunch. First hide dispatched notification and persisted its flag.
- Hidden native playback crossed track boundaries with the exact 3-track queue, volume 0.37, repeat all and media controls intact for >3 minutes. Two longer probes were interrupted by manual QA app quits (user confirmed); no app defect found. No temporary diagnostic instrumentation added. Uninterrupted >5 minute soak remains unverified: the final probe also ended when the QA process exited; a later read showed its preference had changed to quit. Do not classify these interrupted probes as successful soak tests. Immediate hide/reopen verified the same process (PID 18468), same queue/volume and uninterrupted playing state with position advancing from 24.7 to 26 seconds. Native Command-Q with background mode selected removed the QA process; setting Quit Muse then closing also removed it, with preference persisted as quit.
- Automated tray-menu clicking is not exposed by the available native automation surface; tray construction succeeds and handlers reuse the tested native command/restore/exit paths. User reported the feature worked during manual QA. Windows/Linux native runtime unavailable. Linux requires a tray host and Show Muse menu fallback; notification display follows OS settings. Dark English UI is Muse’s existing supported appearance/language.


## Handoff
Implementation is complete. Enable Music folders → Background playback → Keep running in background. The default remains Quit Muse. Production bundle: `muse/src-tauri/target/release/bundle/macos/Muse.app`. No commit was requested or created. Unrelated repository changes were preserved. The QA player was explicitly quit after inspection. Optional longer soak testing, direct automated tray-menu clicks, notification-banner delivery under each OS permission state and Windows/Linux runtime checks remain outside the verified coverage above; native macOS close/playback/restore/quit and preference retention were verified.
