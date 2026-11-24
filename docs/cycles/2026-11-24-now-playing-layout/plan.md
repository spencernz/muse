# Steps
- [x] `player.tsx`: restructure `NowPlayingScreen` (tabs, left column, lyrics column, playback bar, queue); drop the visual-wide state.
- [x] `now-playing.css`: new grid layout, borderless details/lyrics/controls, lyric sizes, narrow stacking.
- [x] `shared.tsx`: remove the cloud badge and the `remote` prop; update call sites and the SSH help copy; README/docs mentions.
- [x] Tests: update the Now Playing tab, lyrics, visual-wide and remote-badge tests.

# Validation
- `npm test -- --reporter=dot`, `make typecheck`, `make lint`.
- Preview screenshots of Now Playing (both tabs) at 1180 and 760 px.

# Progress and decisions
- The Visual tab fits the visualizer and its effect controls inside the same square as the artwork, so the details, seek bar and transport do not move when switching tabs (found in the first preview, where the Visual tab pushed the controls down by about 100 px).
- Lyrics now load as soon as Now Playing opens; the `app.test.tsx` setup defaults `api.lyrics` to no lyrics. Sung lines get a `past` class and are dimmer; the current line is larger.
- Close and all Now Playing buttons use soft fills instead of outlines; queue row lines are hidden; one divider remains above the queue (it is in the sketch).
- The cloud badge component, its CSS and the `remote` prop are removed; the SSH help text and docs no longer mention it.

# Results
- `npm test -- --reporter=dot`: 25 files, 145 tests pass. The tab and lyrics test was rewritten for the two tabs and always-on lyrics; the expand-width test was removed with that mode; the remote test now asserts there is no badge.
- `make typecheck`, `make lint`: pass.
- Preview screenshots at 1280×900 (both tabs) and 760×900 with a synthetic cover and synced lyrics match the approved mockup; the narrow layout stacks artwork, details, then lyrics.
- Not verified: the installed app with real covers, real synced lyrics scrolling during playback, and the visualizer running with live audio in the square slot.
