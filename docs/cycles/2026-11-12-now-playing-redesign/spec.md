# Status
Implementing.

# Problem and outcome
The Now Playing artwork is too large relative to the information column, and the Visual Effects tab is visually busy. The listener should see a balanced Now Playing layout, a calmer Visual Effects tab, and an uncluttered Lyrics or Visual Effects view. Approved mockup: https://claude.ai/artifact/VNrgEGJivaWMmP2KSwHxSQ (private to the user).

# Scope
Included:
- Artwork column fixed at 340px on desktop widths (was up to 520px in a near-equal split). Information column takes the remaining width.
- An "Up next" line under the artwork naming the next queued track when one exists.
- Play/pause button in the Now Playing toolbar reduced from 68px to 60px.
- Visual Effects: remove Chalk Zoo entirely (effect, renderer, artwork textures, artwork assets, tests, README credit). Saved `chalk` preferences migrate to `wave`.
- Visual Effects controls: compact effect buttons (Spectrum, Wave, Retro, Fire); colour themes as five swatch radio buttons; Energy and Shuffle effects move into a settings popover opened by one icon button.
- Visual status label shown only for non-live states (waiting, paused, interrupted, unavailable, canvas fallback, reduced motion).
- Expand and Fullscreen visual actions remain, rendered at reduced opacity until hover or focus.
- Track title and artist shown under the artwork while Visual Effects is selected.
- Seek bar and Now Playing toolbar (volume, transport, output, queue) are hidden while Lyrics or Visual Effects is selected; shown on Now Playing.

Excluded: queue section, lyrics rendering, visual renderer algorithms other than Chalk Zoo removal, mini player.

# Acceptance criteria
- At desktop width the artwork renders at most 340px square; at ≤850px the single-column layout keeps the artwork centred at most 340px.
- With a following queued track, "Up next · <title>" shows under the artwork; with none, the line is absent.
- No "Chalk Zoo" button exists; `effects` is `spectrum, wave, retro, fire`; a stored `{effect:"chalk"}` loads as `wave` with other preferences preserved; shuffle never selects chalk. `public/visualizers/chalk-pals/`, `chalk.ts`, `chalk.test.ts`, `artwork-textures.ts` are removed.
- Colour swatches are a labelled radiogroup; selecting one saves the theme. The settings button exposes `aria-expanded`, opens a panel holding the Energy slider (hidden for Retro, as before) and the Shuffle effects checkbox; Escape and an outside click close it and Escape returns focus to the button.
- "Live audio" is not displayed; other statuses still display in the stage.
- On Lyrics and Visual Effects tabs, the Playback position slider and the "Now Playing controls" group are not rendered; on Now Playing they are. Keyboard playback shortcuts continue to work.
- Fullscreen, expand-width, focus restoration and engine reuse behaviour is unchanged.

# Decisions and open questions
- User chose 340px artwork and Chalk Zoo fallback to Wave (2026-11-12).
- User asked to hide transport and progress on Lyrics and Visual Effects. This departs from the 2026-11-01 visual-display-modes decision that kept them in wide mode. The mini player is not shown on the Now Playing page, so on these tabs playback is controlled by keyboard shortcuts or by returning to the Now Playing tab.
- Panels share a fixed height so tab switching does not shift the artwork; the transport disappearing on non-playing tabs is accepted.
