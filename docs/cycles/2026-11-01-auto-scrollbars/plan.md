# Steps
- [x] Inspect existing persistent scrollbar styling and Lyrics screenshot.
- [x] Add shared activity tracker and fade styles; integrate once at App mount.
- [x] Test idle timing, nested panes, dragging and cleanup; run frontend checks and rebuild.
# Validation
DOM event tests with scrollable metrics exercise actual listener installation and lifecycle. CSS keeps dimensions stable. Native inspection attempted through CUA if available.
# Progress and decisions
Existing CSS sets permanent #444444 thumbs and now-surface queue thumbs. Override only thumb colour, leaving overflow and geometry intact.
# Results
Pending.

Implementation done. `npm test -- src/scrollbar-activity.test.ts src/ui/app.test.tsx`:38 passed. `npm run typecheck` and `npm run lint`:passed. Event tests cover timer reset/idle, independent nested panes, wheel/focus, drag hold/release and cleanup. CSS uses transparent paint, preserving hit targets; no universal transition overrides existing app motion. Actual native visual inspection remains unavailable (CUA pipe startup failure), so visual acceptance pending. Updated release bundle rebuilding.

Final combined frontend suite after scrollbar integration: `npm test` —138 passed across25 files. Final frontend build emits separate lazy Retro chunks and packaged artwork; updated native release build underway.

## Release handoff
Final `npm run bundle -- --bundles app` succeeded (29.95MiB). Ad-hoc signing and `codesign --verify --deep --strict --verbose=2` passed. Replaced the existing release bundle at src-tauri/target/release/bundle/macos/Muse.app. Terminated old PID23901, opened that exact bundle, and verified new PID30425. Implementation and release delivery are finished; cycle remains implementing only because native visual/performance acceptance could not be observed with the unavailable CUA service. No changes to remote media, credentials or library data; no commit made.

## Follow-up: zero-gutter indicators
Confirmed prior CSS explicitly reserved10px WebKit gutter while hiding only thumb paint. Native scrollbar now zero-width/none at all times, with temporary fixed overlay thumbs on activity. No content resizing between idle/active; drag maps thumb travel to scrollTop/scrollLeft. Handles nested panes, parent scroll, window resize, modal-dialog parent, idle cleanup and drag capture/release. New regression verifies thumb rendered outside layout, native scroll position changes on drag, and indicator removed after idle. Actual WKWebView visual verification remains unavailable.

## Final combined release
`npm test`:136 passed; `npm run typecheck`, `npm run lint`, `npm run bundle -- --bundles app`:passed. Bundle 50.03MiB. `codesign --verify --deep --strict --verbose=2`:passed. Replaced current app, old PID30425 terminated, new PID32528 verified. Native CUA again returned `Sky Computer Use native pipe startup failed`, so visual appearance remains unverified; implementation and delivery done. No commit made.
