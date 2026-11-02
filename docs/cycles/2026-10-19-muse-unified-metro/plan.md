# Steps
- [x] Inspect shell, album hero, player, CSS architecture, routing and existing tests.
- [x] Save shell refactor, contextual navigation and Back history using existing state/actions.
- [x] Flatten album styling and separate edition/disc title metadata for presentation.
- [x] Make player universal and full-width with existing sliders, implement responsive shell/control styling.
- [x] Update behavioral tests and run relevant checks.
- [ ] Inspect wide/narrow UI and build current release app.

# Validation
Tests cover route history/search, import delegation, persistent footer, repeated queue clicks, transport, seeking/volume and album actions. Preserve square slider CSS in metro.css. Run Muse test, lint and build scripts; run native tests if native code changes (none planned). Inspect normal views, album, Now Playing, long titles and empty/error states at wide and narrow widths with keyboard focus/reduced motion where tools permit. Native-only import dialog/audio verification must be distinguished from mock checks. Do not launch the old debug bundle.

# Progress and decisions
Existing source is untracked alongside unrelated App Mono changes. Keep changes limited to Muse and this cycle. The previous queue-scroll fix is retained. No commits requested.

User review after opening the release: restore the previous cover-tinted blur on album pages and fix Now Playing cover colors. Updated spec before implementing. Restored album artwork/overlay/fade using `overflow: clip` to preserve the earlier scroll fix. Now Playing's progress input had lost its `--now-accent` override during removal of footer theme rules; restored the override and strengthened the cover-derived overlay tint. Added album-cover fallback when the playing track has no individual cover, keeping the visible artwork and theme source consistent. Sidebar/footer retain solid charcoal styling.

# Results
- `npm test`: 28 tests passed, including route history/search, persistent footer DOM, album actions, queue scroll targeting, transport and seek/volume handlers. Existing expectations for blurred album heroes and hidden Now Playing footer controls were updated to the requested behavior.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking.
- `git diff --check`: passed for tracked files. Muse was already untracked before this task.
- Visual verification is pending: in-app browser creation reports `Browser is not available: iab`; browser inventory is empty. Selecting the exact release app shows the running pre-refactor interface. Native clicks are rejected with an app-changed error asking for an unavailable `get_app_state` tool. Do not count that running window as validation of the new build. Dark English Muse is the only supported appearance/language; generic App Mono light/i18n checks do not apply.
- `CARGO_NET_OFFLINE=true npm run bundle`: passed after final formatting and validation. Current app: `muse/src-tauri/target/release/bundle/macos/Muse.app`. Verified bundled executable's SHA-256 matches the final release executable. Existing Cargo warning: block v0.1.6 future compatibility.
- Implementation and packaging are ready. Cycle remains implementing because wide/narrow visual acceptance and native interaction checks are blocked by the computer tools. Restart the exact release bundle to review; the existing running process does not reload packaged UI changes. No native code changed and no additional dependencies installed. No commit requested or created.

Follow-up checks: `npm test` passed all 29 tests, including a new App-level test loading warm then cool artwork, checking updated Now Playing palette variables and album-cover fallback. Album test again checks background artwork as well as preserved actions. `npm run lint`, `npm run build` and `CARGO_NET_OFFLINE=true npm run bundle` passed. User's supplied album screenshot verifies the previous build's normal album layout; the restored atmosphere and Now Playing changes still require native visual review. Final release bundle now includes these follow-up changes.
