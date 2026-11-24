# Status
Implementing.

# Problem and outcome
Now Playing hides lyrics and visual effects behind tabs in the right column, so a listener sees either song details, lyrics or visuals, never lyrics with the artwork. The user sketched a new layout and approved an interactive mockup (https://claude.ai/artifact/TiqdP8JDEwmg697FggB9X1).

# Scope
Included:
- Two tabs above the left column: **Now playing** and **Visual**.
- Left column: album artwork (Now playing) or the visualizer with its effect controls (Visual), then the song details (title, artist, album · year · genre · length, Favourite, Add to playlist).
- Right column: lyrics, always visible, filling the column height; the current line is larger and brighter, sung lines are dimmer.
- Full-width playback bar under both columns: seek bar, then volume | transport | output and queue.
- Queue below a divider.
- No boxed panels or borders around the song details, lyrics or controls; buttons use soft fills.
- Remove the remote-music cloud badge from all artwork (Now Playing, player bar, albums, Home tiles).
- Narrow windows: columns stack (artwork and details, then lyrics).

Excluded: changes to lyrics fetching, the visualizer engine, queue behaviour, the mini player and the empty Now Playing state.

# Acceptance criteria
- Tabs are "Now playing" and "Visual" with arrow-key navigation; Visual replaces the artwork with the visualizer and its controls; song details stay visible on both.
- Lyrics load when Now Playing opens and stay visible on both tabs; empty, error and instrumental states still show.
- Playback position, transport and queue are unchanged and stay in place when switching tabs.
- No cloud badge appears on any cover.
- Layout works at 1180px and stacks at ≤ 900px without horizontal overflow.
- `npm test`, `make typecheck`, `make lint` pass; affected tests are updated.

# Decisions and open questions
- Square corners (current Muse style) chosen; the user did not pick rounded in the mockup.
- Song details stay under the visualizer on the Visual tab (mockup default).
- The visualizer's "expand width" mode is removed: in this layout the visual already has its own column, and fullscreen remains.
- Remote tracks remain identifiable in SSH settings; the cloud badge was removed at the user's request.
