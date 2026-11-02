# Steps
- [x] Inspect workflow, UI rules, working tree and current playback layout.
- [x] Implement immersive layout, close/Escape behavior and focus restoration.
- [x] Add mini-player expansion affordance and cover backdrop movement.
- [x] Add behavioral regression coverage.
- [ ] Inspect affected UI at desktop and narrow widths (environment limitation below).

# Validation
Run Muse Vitest, typecheck, lint and production build. Inspect desktop and 320px layouts, keyboard/focus, empty playback, long text, cover fallback and reduced motion where browser access permits. Preserve existing dark-only appearance; no new locales or themes.

# Progress and decisions
Repository has extensive pre-existing uncommitted work. Limit changes to Muse playback UI and this cycle.

# Results
- `npm test -- --reporter=dot`: passed, 47 tests across 3 files. Existing React/virtualizer flushSync warnings remain. Coverage includes full-window navigation structure, Close/Escape, prior route/search restoration, focus, empty playback, open-dialog Escape guard, existing queue focus/scroll, cover replacement and broken/missing cover fallback.
- `npm run typecheck`: passed on final source.
- `npm run lint`: passed on final source.
- `npm run build`: passed on final source.
- `npm run desktop`: Rust dev compilation passed; process exited after launch because Muse's single-instance handler detected the existing app. Existing Muse session was left running. Build emitted an upstream Rust future-compatibility warning for block 0.1.6.
- UI inspection discovery: computer-use inventory has no connected browsers. No desktop/320px screenshot, live hover, motion, or reduced-motion inspection of changed code was possible without replacing the user's running native app. These visual acceptance checks remain pending. Existing app supports dark appearance only and has a 620px native minimum width.
- Reviewed touched source and cycle documents for scope. Whole Muse directory was already untracked in the parent repository, so Git cannot provide a baseline diff for these files. Task source edits: src/ui/app.tsx, src/ui/player.tsx, src/now-playing.css, src/ui/app.test.tsx. No commits or staging performed; root pre-commit make checks were not required or run.
- Implementation is ready; cycle remains implementing pending actual visual verification.

## Desktop rebuild follow-up
User reported the changes were not visible. The prior `npm run build` only rebuilt web assets; the running release app still embedded its older assets. Run `npm run bundle`, quit the prior process cleanly, and reopen the release app at src-tauri/target/release/bundle/macos/Muse.app. Full release rebuild and relaunch verification in progress.

Follow-up result: `npm run bundle` passed, including optimized Rust release compilation and macOS app bundling. Quit the prior app with Cmd+Q and reopened the release bundle via native app control. Verified the rebuilt app exposes the new Expand Now Playing tooltip; activated the artwork and inspected the actual dark desktop window at 1180×800 logical pixels (2360×1600 screenshot). Full-width cover backdrop, absent sidebar/footer, long track title wrapping, visible top-right Close button, seek, transport, volume and queue controls confirmed. Left the updated app open on Now Playing. Narrow and reduced-motion visual checks remain pending.

## Close button design correction
- [x] Share Back button geometry, border, surface and hover styles with Close; remove the separate rounded treatment.
- [x] Run Muse checks, rebuild the desktop bundle, relaunch and inspect the corrected button.

Design correction results: `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot` (47 tests) and `npm run bundle` all passed. Reopened release bundle after clean quit and verified actual Now Playing screenshot at desktop width: Close has square corners, 48px geometry and the same border/surface as Back. Shared rules live in src/unified-layout.css; removed competing geometry/surface rules from src/now-playing.css. No commit. Prior narrow/reduced-motion inspection limitations remain.
