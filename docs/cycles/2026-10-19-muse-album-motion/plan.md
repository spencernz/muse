# Steps
- [x] Inspect existing grid, routing/history, album hero, CSS, playback shell and tests.
- [x] Implement an isolated content-only animation controller and integrate existing album activation/Back paths.
- [x] Persist grid view and restore origin scroll/focus, with cancellation and motion fallbacks.
- [x] Coordinate detail/scatter motion and integrate the album background behind navigation; resize Back to the final 48px.
- [x] Add behavioral/animation lifecycle coverage and run tests/lint/build.
- [x] Package the final release.
- [ ] Visually verify current native build at wide/narrow widths, including interruptions and reduced motion if tools permit.

# Validation
Exercise real App click/keyboard paths plus controller animation geometry/lifecycle tests. Check nearest-first scatter, source/destination matching, reverse scroll restoration, sort retention, rapid selection, resize, missing artwork, and reduced-motion fallbacks. Run Muse tests, lint and build. Native performance and visual smoothness require real UI inspection; previous native controls failed with stale-app errors and no browser was available, so record limitations if still present. Do not open the old debug app.

# Progress and decisions
Implemented AlbumNavigation as a content-only controller, with a thin layout-effect hook around existing Zustand routes. Stable album IDs match source cards to destination heroes. Snapshot and hide visible neighbors, bound measurement to a 161-card neighborhood, animate only transforms/opacity, and remove temporary inert layers after use. Forward motion finishes around 650ms; reverse around 520ms. Grid tab/sort live in the existing store so remounting does not reset the view. Reduced motion/unloaded art navigate immediately while still restoring scroll on Back. Resize, user scrolling, rapid selection, navigation away and unmount clear delayed work and hidden state.

Follow-ups implemented: album backdrop now belongs to the main content panel and extends behind contextual navigation. Back was initially 56px and reduced to 48px after user feedback. Now Playing hides the footer and reuses extracted VolumeControl beside its immersive transport, retaining queue access. Home artwork captions reveal on hover/focus and remain visible on non-hover devices.

Temporary synthetic-music QA entry rendered the real App, routes, CSS, and animation controller in Chrome. It was removed after inspection and the local dev server stopped. No QA fixture is shipped. Unrelated repository work remains unchanged; no commit requested.

# Results
- `npm test`: all 41 tests passed (including 11 animation-controller tests and keyboard App navigation/sort/scroll/focus coverage).
- Controller tests cover physical destination transforms, visible-only scatter/stagger, reverse travel, reduced motion, fast repeated selection, unrelated navigation, resize/disposal, missing source, Back during flight, and user scroll interruption. A jsdom focus selection-change timer is drained before the final no-pending-timers assertion.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking.
- Chrome visual inspection through native computer controls: dark English current-source App at 1654px and 661px CSS widths (100% and 250% browser zoom; reset afterward). Verified album opening and Back in the real UI, long edition title layout, continuous tinted header, square Back, full-width normal footer, narrow sidebar rail/wrapped footer, Now Playing without footer, usable in-page volume (changed from 0.8 to 0.5), and Home artwork captions hidden at rest. Keyboard focus ring was visible during navigation. Initial standalone browser provider was unavailable; refreshing native Chrome state in the same tool call enabled reliable inspection.
- Browser checks used synthetic library/IPC responses, not real audio or filesystem actions. Native WebKit visual smoothness/60 FPS, native import/audio, and visual reduced-motion behavior remain unverified. Reduced-motion behavior is covered in automated tests. Do not claim measured 60 FPS.
- `CARGO_NET_OFFLINE=true npm run bundle`: passed. Final release is `muse/src-tauri/target/release/bundle/macos/Muse.app`; verified its bundled executable matches the freshly compiled release binary by SHA-256. Existing block v0.1.6 future-compatibility warning remains. Temporary QA HTML/TSX files were removed before the final build, and the temporary dev server was stopped.
- `git diff --check`: passed for tracked files; Muse remains untracked as it was before this task. No native Rust changes, added dependencies or commits. Implementation, browser checks and packaging are ready. Native WebKit visual/performance verification remains pending after restarting the current release; cycle stays implementing until that acceptance check is completed.

## Follow-up: background cutoff and transition blink
- [x] Anchor the album backdrop to the main viewport, independent of tracklist scroll length, and remove the conflicting opaque canvas override.
- [x] Add a deterministic artwork-handoff regression with delayed animation completion/image decoding; diagnose and correct premature clone removal.
- [x] Run tests/lint/build and package the corrected release. Native frame smoothness remains a visual verification item.

### Follow-up diagnosis and verification
- Reproduced the premature artwork removal deterministically with `npm test -- --run src/album-navigation.test.ts`: 2 failed / 11 passed before the fix. Both failing cases exercise the actual navigation controller with a pending compositor completion and a pending destination decode.
- Ranked causes: wall-clock cleanup outrunning animation completion; decoded destination not ready at cleanup; synchronous clone creation briefly showing an undecoded image. The first two were confirmed by failing lifecycle tests. Clones now request synchronous decoding and destination images eager loading, but initial native image-compositor behavior remains unmeasured.
- Removed fixed-duration artwork and run cleanup. Forward and Back handoffs await the actual `Animation.finished` promise, destination decoding, and a frame with the real image revealed underneath the projection. Cleanup waits for all detail/scatter animations. Cancellation guards prevent stale decode/animation completions touching later navigation; pending frames are cancelled on disposal/interruption.
- Album backdrop is now a sibling of the scrolling main inside its isolated viewport container, with the cover-derived base color retained. This keeps the texture across the full visible tracklist regardless of scroll length and avoids sizing a huge blurred image to thousands of rows.
- Chrome current-source visual checks at 1654px and 661px CSS widths, dark English, synthetic 30-track albums: verified tinted navigation/hero and continuous background through track 30; sidebar/footer remain solid and stationary. Opening the album settled correctly. Browser zoom restored and the QA tab closed. Temporary fixture files and dev server removed. Native frame smoothness is still pending; no claim of measured 60 FPS.
- `npm test`: 44 passed. `npm run lint`: passed. `npm run build`: passed. Packaging result follows below.

- Follow-up packaging: `CARGO_NET_OFFLINE=true npm run bundle` passed; current release bundle rebuilt successfully. SHA-256 of the bundled executable matches the fresh release binary. Existing Rust block v0.1.6 warning only. No commit. Native smoothness remains unverified.
