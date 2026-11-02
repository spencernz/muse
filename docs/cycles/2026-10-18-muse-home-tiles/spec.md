# Status
Complete.

# Problem and outcome
Home's Metro tile section grows excessively on large windows, hiding the album shelf below. The supplied screenshot also shows artwork failing to fill its tile. Keep the approved square design while making this section compact and its artwork edge to edge.

# Scope
Home tile layout and artwork positioning, plus removal of the redundant sidebar local-first/import block requested in the follow-up screenshot. Preserve the top-right import action, saved tile sizes, order, resizing, drag/drop, navigation, artwork fallbacks and playback actions. No database or player changes.

# Acceptance criteria
- Desktop unit tiles cap at 156px square, and a featured 2×2 tile caps at 320px with an 8px gap.
- Desktop grid uses up to six unit columns, allowing the default tile collection to occupy approximately two rows; album shelf remains visible below on normal desktop windows.
- At narrower widths the grid adapts to four or two columns without horizontal overflow, while saved size spans and edit controls still work.
- Tile artwork fills its entire button, using proportional cover cropping. Missing/broken artwork keeps the existing fallback.
- Square corners, visible focus, caption readability and reduced-motion behavior remain intact.
- The sidebar no longer repeats the local-first/no-streaming copy or import button; top-right import and bottom-aligned settings remain available.
- Relevant tests/build/lint/typecheck pass, and desktop/narrow Home are visually inspected.

# Decisions and open questions
Use container-based grid geometry rather than viewport arithmetic, so sidebar and window sizing cannot make grid cells diverge. Preserve the existing saved size contract rather than forcibly changing user tile preferences. The user's square-corner and colourful Metro direction overrides general repo UI defaults. Muse currently supports dark/English appearance only.
