# Status
Complete.

# Problem and outcome
Album pages should immerse listeners in the album's own artwork and palette while preserving library and playback interactions. Full requirements are in [brief.md](brief.md).

# Scope
Existing Muse album screen, reusable canvas palette extraction and cache, scoped styling, and regression tests. Follow-up user request expands the geometry and outlined button treatment across all Muse screens, including persistent shell, tiles, player, sliders, checkboxes, inputs and dialogs. No audio engine or database changes.

# Acceptance criteria
- Actual local artwork forms an overscanned blurred hero, with crisp square foreground art and a fade into a dark album-tinted tracklist.
- Representative palettes avoid muddy averaging, use contrast-checked accent and muted text, and provide neutral fallback for missing, failed and monochrome art.
- Cache uses resolved content-hashed artwork identity, coalesces sampling, bounds memory and prevents stale themes during navigation/unmount.
- All album controls, rows and dialogs have square edges, visible focus and responsive targets; reduced motion disables transitions.
- All Muse screens use square edges, with shared outlined secondary buttons matching the approved album design. Native range and checkbox controls must also render with square geometry while retaining keyboard operation.
- Existing back, artist, play, shuffle, favourite, playlist, pin and track interactions remain functional.
- Tests, lint and build pass. Inspect desktop and narrow layouts with contrasting synthetic covers and failure states.

# Decisions and open questions
The supplied brief intentionally overrides general UI rules for square corners, artwork gradients, tinted page surfaces and 300ms colour transitions. Muse currently supports dark appearance and English only; do not add unrelated appearance or translation systems. Reuse convertFileSrc and existing restricted artwork scope/CSP. Local artwork filenames contain a content hash; no database changes required. HTTP sources must support CORS for sampling; otherwise use neutral fallback.
