# Status
Implementing.

# Problem and outcome
After the first Now Playing redesign the user found the screen "really busy" and the small-window layout poor (artwork pushed content down, controls below the fold, misaligned lyrics, close button over the artwork). The user approved the calmer and small-window mockups (https://claude.ai/artifact/TiqdP8JDEwmg697FggB9X1, artboards "Now Playing — calmer" and "Now Playing — small window") and asked to remove Chalk Zoo completely.

# Scope
Included:
- Remove the Now playing / Visual tabs; a Visualizer toggle button in the controls bar swaps the artwork (wide) or the lyrics (small) for the visualizer.
- Calmer lyrics: only the current line is bold and bright; other lines regular weight, smaller and dimmer (sung lines dimmest); max line width; hidden scrollbar; soft fade; no visible "Lyrics" label.
- Song details: larger title; muted album line; Favourite and Add to playlist as icon buttons.
- Fewer solid blocks: Play is the only filled control; secondary transport icons dimmer.
- Missing artwork in Now Playing shows a quiet music-note placeholder instead of the album title in large type.
- More spacing; centred narrower content.
- Small windows (≤ 700 px): compact header (64 px cover, title, artist, album, icons) clear of the close button, lyrics filling the middle, controls pinned to the bottom.
- Remove the Chalk Zoo effect, its texture loader and images; a saved Chalk Zoo choice becomes Spectrum. Visual effects: Spectrum, Wave, Retro, Fire.

Excluded: lyrics fetching, the visualizer engine for the remaining effects, queue behaviour, mini player.

# Acceptance criteria
- No tablist in Now Playing; the Visualizer button (`aria-pressed`) toggles the visualizer and back; effect buttons are Spectrum, Wave, Retro, Fire.
- Lyrics current line bold/white, others regular and dimmer, past lines dimmest; no scrollbar.
- Now Playing without artwork shows an icon placeholder, not the album title.
- At 420 px wide: header, lyrics and controls fit without scrolling to reach the controls; the close button does not overlap content.
- No Chalk Zoo code, tests or images remain; a stored `chalk` preference loads as `spectrum`.
- `npm test`, `make typecheck`, `make lint` pass.

# Decisions and open questions
- Visualizer toggle (option 1) chosen by the user; the state lasts for the session.
- On small windows the visualizer replaces the lyrics; on wide windows it replaces the artwork.
- Add to playlist stays beside Favourite in the details on both widths (the mockup put it in the bottom row on small windows); one place is simpler.
