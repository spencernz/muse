# Steps
- [x] Native bounded playlist/favourites artwork query.
- [x] Mosaic layouts, one-slot rotation, crossfade and visibility/motion guards.
- [x] Integrate cards, verify behavior and rebuild.
# Validation
Verify cover membership/deduplication and selection uniqueness, source/track changes, fallback. Focused frontend tests, typecheck/lint, native checks and release build. Attempt visual verification if computer-use service is available.
# Progress and decisions
Read workflow/UI rules; playlist tiles currently render a static icon/title/count. Use a small cover-path-only query instead of loading hundreds of full tracks per card.
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
