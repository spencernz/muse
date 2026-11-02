# Steps
- [x] Add a regression check for queue scrolling through the real App click paths.
- [x] Restrict queue scrolling to main content and use non-scrolling artwork clipping.
- [x] Run Muse tests, type checking, lint and frontend build.
- [ ] Inspect the rebuilt native UI at desktop and narrow widths.

# Validation
Check destination coordinates with a partially scrolled viewport and nonzero viewport offset. Exercise initial navigation, repeat clicks, keyboard focus and reduced motion. Inspect queue opening and return to top in native Muse at desktop and narrow widths.

# Progress and decisions
User screenshots show bottom space and cover clipping after queue navigation. Existing scrollIntoView walks ancestor scroll containers; .now-page uses overflow:hidden with oversized absolute artwork. For this small layout issue, use a focused behavioral test and supplied/native visual evidence rather than a full bisection or instrumentation loop. Tests cannot establish native visual correctness.

# Results
- `npm test -- src/ui/app.test.tsx -t 'opens the queue by scrolling only'`: failed before the fix (main content did not receive the target scroll), passed after the fix. Covers navigation into Now Playing and repeated clicks using nonzero content scroll and viewport offsets. It verifies scroll targeting and focus, not browser layout.
- `npm test`: passed, 26 tests.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking. Initial check caught a leftover scrollIntoView option; removed it and reran successfully.
- `git diff --check`: passed for tracked changes; Muse is already untracked in this workspace.
- Native inspection before the fix showed the clipped cover. UI actions were blocked by the computer tool reporting that the app had changed, even after refreshing state. Desktop/narrow visual verification, keyboard scrolling, and the bottom-gap recovery remain pending. Muse uses its existing dark English appearance; other themes/languages do not apply.
- `CARGO_NET_OFFLINE=true npm run bundle`: passed; rebuilt `muse/src-tauri/target/release/bundle/macos/Muse.app`. Cargo emitted an existing future-compatibility warning for block v0.1.6.
- No commit requested or created. Source and desktop build are ready; visual acceptance remains pending after restarting the release app. The computer tool continued rejecting input with app-changed / Computer Use not active errors, so native verification could not be completed.
