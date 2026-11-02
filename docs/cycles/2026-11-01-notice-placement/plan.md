# Steps
- [x] Inspect screenshot, notice DOM, window controls and CSS cascade.
- [x] Position Now Playing notices below window controls without consuming layout space.
- [x] Run existing App tests, lint and typecheck; attempt native inspection.
# Validation
Control row spans y=16..64; notice starts y=72. Check 320px and desktop widths, long text, independent dismissal and unchanged player position. Run App integration tests. No new CSS-source assertion test: it would mirror implementation without establishing rendered geometry.
# Progress and decisions
Confirmed `.now-content > .notice` only has 16px margins and remains in flow. `.window-actions` is absolute at top16/right16 with 48px controls, causing the overlap visible in the user's screenshot. The macOS drag region occupies y=0..32. A notice below y=72 clears both.
# Results
`npm test -- src/ui/app.test.tsx`: 35 tests passed. `npm run typecheck` and `npm run lint`: passed. Native inspection attempted via CUA, but returned no available surfaces and `Sky Computer Use native pipe startup failed`. Desktop/narrow rendered geometry remains unverified; cycle stays implementing until visual verification. Source fix uses top72px, 16px gutters, max520px width, word wrapping, viewport-bounded scrolling and a 40px dismiss target. It removes the message from flow, so notice state no longer changes the player layout. No new release bundle installed yet; include with the ongoing visualizer rebuild.

Final combined frontend suite after scrollbar integration: `npm test` —138 passed across25 files. Final frontend build emits separate lazy Retro chunks and packaged artwork; updated native release build underway.

## Release handoff
Final `npm run bundle -- --bundles app` succeeded (29.95MiB). Ad-hoc signing and `codesign --verify --deep --strict --verbose=2` passed. Replaced the existing release bundle at src-tauri/target/release/bundle/macos/Muse.app. Terminated old PID23901, opened that exact bundle, and verified new PID30425. Implementation and release delivery are finished; cycle remains implementing only because native visual/performance acceptance could not be observed with the unavailable CUA service. No changes to remote media, credentials or library data; no commit made.
