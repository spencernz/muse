# Steps
- [x] Remove Chalk Zoo: `types.ts`, `preferences.ts` migration, `effects.ts`, `engine.ts`, `render-quality.ts`, `visual-effects.tsx`, `chalk.ts`, `chalk.test.ts`, `artwork-textures.ts`, `public/visualizers/chalk-pals/`; update tests.
- [x] `player.tsx`: drop tabs; Visualizer toggle in `NowPlayingToolbar`; details with icon buttons; quiet artwork placeholder; compact cover for small windows.
- [x] `now-playing.css` / `visual-effects.css`: calmer type and spacing, lyrics styles, small-window layout with pinned controls, effects inside the square.
- [x] Tests: Now Playing toggle, placeholder, migration.
- [x] README.

# Validation
- `npm test -- --reporter=dot`, `make typecheck`, `make lint`.
- Preview screenshots at 1280×900 and 420×860, artwork and visualizer states.

# Progress and decisions
- Chalk Zoo removed with its texture loader and the 12 `public/visualizers/chalk-pals` images; the engine's ambient-frame path and effect status hook existed only for it and were removed. `validatePreferences` maps a saved `chalk` to `spectrum`.
- The lyrics pane opts out of the overlay scroll indicator (`data-quiet-scroll`), which otherwise flashed on every automatic lyric scroll.
- Small windows (≤ 700 px): `.now-left` uses `display: contents` so the details, view and lyrics can be reordered; `.now-page .now-main` beats the later `unified-layout.css` `min-height: 100%`; the stacked stage must stretch its children (the wide grid centres them). Add to playlist is hidden in the compact header; it stays available from track menus and the wide layout.
- Headless Chrome cannot render narrower than 500 px, so small-window screenshots use 500 and 620 px (the app's minimum window width is 620 px).

# Results
- `npm test -- --reporter=dot`: 24 files, 144 tests pass (toggle/placeholder test replaces the tab test; Chalk Zoo tests replaced by a four-effect test; shuffle expectations updated; migration covers `chalk`).
- `make typecheck`, `make lint`: pass.
- Preview screenshots: 1280×900 without and with artwork plus the visualizer; 500×860 and 620×860 small layouts with lyrics and with the visualizer. Matches the approved mockups.
- Not verified: the installed app with real lyrics scrolling and live audio in the visualizer.
