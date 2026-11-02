# Steps
- [x] Read workflow/UI rules and inspect theme extraction and hardcoded accents.
- [x] Add blue fallback and bind shared shell tokens to playback palette.
- [x] Replace hardcoded purple action, selection and focus accents with shared tokens.
- [x] Extend regression checks for shell palette updates and fallback contrast.
- [x] Run checks, rebuild/relaunch desktop release and visually inspect available palettes.

# Validation
Run npm run typecheck, npm run lint, npm test -- --reporter=dot and npm run bundle. Reuse palette contrast and async race coverage; assert shell tokens update with cover changes and reset on clear. Native inspection: default/grayscale blue, colored cover accent where available, square Close and Back, primary hover/selection/focus. No new theme/locales or layout changes; record desktop and narrow visual limitations.

# Progress and decisions
Whole Muse directory is pre-existing untracked work in the parent repo. Limit edits to theme CSS, extraction fallback, app tokens, relevant tests and this cycle. Retain existing album-specific theme overrides.

# Results
Initial checks passed: npm run typecheck, npm run lint, npm test -- --reporter=dot (47 tests). Final checks and release bundle after the last CSS/test edits are running. Existing React virtualizer flushSync warnings remain. Blue fallback and warm/cool palette contrast pass; shell palette persists across route changes and resets when playback is cleared.

Final accent checks passed: npm run typecheck, npm run lint, npm test -- --reporter=dot (47 tests), npm run bundle. Release relaunch is being combined with the subsequently requested native-titlebar update (docs/cycles/2026-10-31-integrated-titlebar).

Combined release verification: final npm run typecheck, npm run lint and npm test -- --reporter=dot passed (48 tests including title-bar test); npm run bundle passed. Quit prior release cleanly and reopened updated release. Actual desktop screenshots show selected SOUR cover supplying its lavender accent consistently to Home branding/nav/overline and footer controls; later grayscale cover supplies #00a3ff blue to Now Playing overline, shuffle, transport, seek and volume. Current colored-cover purple is derived from that artwork, not the default. Narrow, settings/focus/hover and exhaustive palette visual checks remain pending; automated palette contrast checks passed. No commit or staging performed.
