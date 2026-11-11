# Steps
- [x] Remove Chalk Zoo: `types.ts` effects list, `preferences.ts` migration to wave, `effects.ts`, `engine.ts`, `render-quality.ts`, delete `chalk.ts`, `chalk.test.ts`, `artwork-textures.ts`, `public/visualizers/chalk-pals/`, README credit line; update affected tests.
- [x] Visual Effects tab (`src/ui/visual-effects.tsx`, `src/visual-effects.css`): compact effect buttons, colour swatch radiogroup, settings popover, status hidden when live, dimmed display actions.
- [x] Now Playing (`src/ui/player.tsx`, `src/now-playing.css`): 340px artwork column, Up next line, track caption on Visual Effects tab, 60px play button, hide playback block on Lyrics and Visual Effects tabs.
- [x] Update tests in `src/ui/visual-effects.test.tsx`, `src/ui/app.test.tsx`, `src/visualizer/*.test.ts`.

# Validation
- Vitest: visual-effects, app, visualizer tests.
- `make typecheck`, `make lint`.
- UI inspection at normal and narrow widths in the desktop app.

# Progress and decisions
- Chalk Zoo removed with its renderer, `artwork-textures.ts` (only used by Chalk Zoo), artwork assets and README credit. `render-quality` tests that used `chalk` as the high-detail mode now use `retro`.
- Colour swatches stay hidden for Retro, matching the earlier rule that hid the Colour select for Retro (butterchurn presets ignore the theme). Energy stays hidden for Retro inside the settings panel.
- Up next reads `playback.queue[index + 1]`; it is hidden while the title loads or when no next track exists.
- Lyrics and Visual Effects tabs no longer render the seek bar and toolbar. Space, arrow and modifier shortcuts in `src/playback-shortcuts.ts` still control playback.

# Results
- `make typecheck`: passed.
- `make lint`: passed.
- `npx vitest run`: 23 files, 141 tests passed.
- `make typecheck` and `make lint` rerun before commit: passed.
- `npm run bundle`: release `Muse.app` (`local.muse.player`) built and installed to `/Applications/Muse.app` at the user's request.
- UI inspection in the desktop app at normal and narrow widths: not performed by the agent; the user is reviewing the installed build. Spec stays Implementing until that inspection is recorded.
