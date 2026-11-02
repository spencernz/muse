# Muse — Album Atmosphere

> Implementation specification for Codex. Apply these changes to the **existing Muse app**. Inspect its actual components, dependencies, local artwork handling, styles, state management and playback commands before editing. Do not blindly copy example paths or create a second album page.

## Goal

Make every album detail page immersive, with a palette derived from that album's own artwork. The cover appears crisp in the foreground, while an enlarged, strongly blurred version creates a full-width atmospheric hero that fades into the album-tinted tracklist background.

**Non-negotiable visual direction:** strict hard-edge Metro / Windows Phone geometry with **zero border radius**. Atmosphere comes from artwork, colour, and controlled blur—not rounded cards, soft shadows or floating glass panels.

## Preserve existing functionality

Keep all current album actions and states working, including back navigation, playback, shuffle, favourites, add-to-playlist, pinning, track selection, active/playing states and existing keyboard interactions. Do not change the underlying audio engine or library database contract just to achieve styling. Do not remove existing controls that aren't represented in illustrative examples.

## Visual specification

### Hero

- Use the **actual album artwork** as the hero background, scaled to cover, with a generous blur (approximately `blur(55px–75px)`) and optional moderate saturation. Overscan the image behind the hero so blur never exposes empty edges.
- Layer a translucent dark/tinted overlay over it. Use a vertical gradient blending smoothly into `--album-background` at the bottom.
- Foreground: sharp **square** album cover on the left; title, artist, metadata and all existing album actions on the right. Maintain strong alignment, good spacing, and bold typography. At narrow widths, stack content vertically.
- Keep the hero atmospheric but text and buttons clearly readable. Optional `backdrop-filter` may be used sparingly behind controls, with square edges.
- Do not blur the sharp cover, title, or buttons.

### Full-page theming

- Background beneath the tracklist uses the extracted, **darkened album colour**, not an unrelated static black.
- Use four or five stable tokens such as:
  - `--album-accent` — primary action, active track/progress
  - `--album-on-accent` — readable text/icon colour on the accent
  - `--album-background` — dark tinted page background
  - `--album-surface` — secondary action and hover fill
  - `--album-muted` — metadata/secondary text
- Maintain sufficient contrast and always prefer readability over reproducing a cover colour exactly.
- Themed elements should feel coordinated rather than assigning different bright colours everywhere.
- On an album switch, reset to the new album's cached theme or a safe default immediately; never leave the previous album's theme visible while loading.
- Use subtle colour transitions (~250–350ms), and disable them when `prefers-reduced-motion: reduce`.

### Geometry and interactions

- All controls, artwork containers, buttons, cards, inputs, selected rows and overlays use `border-radius: 0`.
- Avoid drop shadows and floating-card treatment. Prefer rectangular zones, clear type hierarchy, strong grid alignment and thin dividers.
- Provide obvious hover, keyboard focus and active/playing feedback. Focus indicators must not be suppressed.
- Retain/implement responsive layouts and sensible minimum tap targets.

## Implementation plan

1. **Inspect first.** Locate the album detail view, album/track types, artwork URI pipeline, global theme/styles, Tauri setup (if applicable), existing player actions, and current tests. Follow the project's established conventions.
2. **Build a reusable artwork-to-theme utility** (or hook). Given an album artwork URL or already-resolved image source, load it, sample it using a small offscreen canvas (~48×48), discard transparent and unsuitable near-black/near-white samples, and choose a representative colour. Convert that colour into coordinated dark background, accent, surface and muted tokens.
3. **Do not use naive averaging as the final algorithm** if it creates muddy colours. A simple first version may use saturated candidate sampling, but consider quantized buckets or a lightweight weighted cluster selection to find a stable representative palette. Ensure black/white and greyscale covers receive a tasteful neutral fallback.
4. **Validate contrast** for action foregrounds and text. Use WCAG relative luminance and contrast-ratio checks (target at least 4.5:1 for ordinary text, 3:1 for sufficiently large text/UI indicators where applicable); select light or dark on-accent text accordingly and adjust an accent when required.
5. **Add caching and cleanup.** Cache by artwork identity (prefer a revision/content hash if present). Avoid repeated sampling when navigating back to an album. Handle missing/broken art, tainted canvas, rapid navigation/unmount, and async race conditions without crashes or stale updates.
6. **Handle local media safely.** Confirm that Tauri or other desktop-runtime local artwork URLs can load in both `<img>` and CSS backgrounds, and are permitted by the app's asset protocol/CSP. Don't use arbitrary raw filesystem paths as image URLs. For HTTP artwork URLs, account for CORS limitations. No network requests are required for locally stored music.
7. **Implement the hero and tracklist styles** using the palette's CSS custom properties, keeping existing components and button handlers. For the blurred background, render a dedicated absolutely positioned layer with overscan and `pointer-events: none`, plus overlay and content layers.
8. **Test and visually verify** several contrasting album covers, then run the project's existing build, lint and test commands. Repair any regressions introduced by this work.

## Suggested component responsibilities (adapt to existing architecture)

```text
AlbumDetailPage
  ├─ useAlbumAtmosphere(artworkSource)
  │   ├─ image loading / colour sampling
  │   ├─ palette derivation + contrast validation
  │   ├─ caching + error fallbacks
  │   └─ race-safe cleanup
  ├─ AlbumHero
  │   ├─ blurred artwork + overlay
  │   ├─ sharp square cover
  │   ├─ album metadata
  │   └─ existing action buttons
  └─ ExistingTracklist (preserve behaviour)
```

This is a logical decomposition, **not** a command to introduce unnecessary files or reorganize working components.

## Styling starting point (adapt classes to existing components)

```css
.album-page {
  min-height: 100%;
  color: #f8f7fa;
  background: var(--album-background, #18151e);
  transition: background-color 300ms ease;
}

.album-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: var(--album-background, #18151e);
}

.album-hero__art {
  position: absolute;
  inset: -75px;
  z-index: -2;
  background-position: center;
  background-size: cover;
  filter: blur(65px) saturate(1.25);
  opacity: 0.8;
  pointer-events: none;
}

.album-hero__overlay {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(90deg, rgb(10 10 16 / 48%), rgb(10 10 16 / 18%)),
    linear-gradient(to bottom, transparent 20%, var(--album-background, #18151e) 100%);
  pointer-events: none;
}

.album-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: end;
  gap: 36px;
  padding: 32px;
}

.album-hero__cover {
  width: clamp(160px, 22vw, 280px);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 0;
  flex: none;
}

.album-page button,
.album-page input,
.album-page img,
.album-page [data-tile] {
  border-radius: 0;
}

.album-primary-action {
  color: var(--album-on-accent, #15111d);
  background: var(--album-accent, #b595e7);
}

.album-track:hover {
  background: var(--album-surface, #312b3c);
}

.album-page :focus-visible {
  outline: 2px solid var(--album-accent, #b595e7);
  outline-offset: 2px;
}

@media (max-width: 680px) {
  .album-hero__content { flex-direction: column; align-items: start; }
}

@media (prefers-reduced-motion: reduce) {
  .album-page { transition: none; }
}
```

**Note:** do not assume this standalone CSS matches the existing page structure; integrate the layering and palette with existing styles. Ensure pseudo-elements, stacking contexts and background layers display correctly in the actual layout.

## Suggested TypeScript interface

```ts
export type AlbumAtmosphere = {
  accent: string;
  onAccent: string;
  background: string;
  surface: string;
  muted: string;
};

// Hook/function signature is illustrative. Match the project's patterns.
export function useAlbumAtmosphere(artworkSource?: string): AlbumAtmosphere;
```

Keep colour-extraction logic testable separately from React. Use existing dependencies if appropriate; otherwise a browser Canvas implementation is a reasonable local-first starting point. When rendering an artwork URL into a CSS background, ensure the source is trusted/validated and safely escaped, or prefer an absolutely positioned `<img>` with `object-fit: cover` so it shares the same working source as the crisp cover.

## Edge cases to test

- `1989 (Deluxe Edition)`: pale cover; avoid a washed-out UI, keep text readable.
- A red/orange saturated cover: atmospheric warm tint, no painfully bright full-page background.
- A blue/purple cover: cool palette with distinct enough surfaces and buttons.
- Entirely black, white or greyscale artwork: elegant neutral fallback.
- Very busy multicolour artwork: stable non-muddy palette.
- Missing artwork and image load failures: no broken layout or thrown exceptions.
- Switching albums rapidly: no previous album colour appearing after a newer page loads.
- Large libraries: no expensive extraction on every re-render.
- Narrow desktop window and accessibility/reduced motion.

## Acceptance criteria

- [ ] Opening any album uses its actual cover as a full-width blurred hero background.
- [ ] The hero fades smoothly into the tinted tracklist/page background.
- [ ] Palette and action accents are album-dependent, stable and legible.
- [ ] Cover artwork in the foreground stays crisp and square.
- [ ] **All corners are square: 0px radius.**
- [ ] Existing back/play/shuffle/favourite/playlist/pin/track interactions continue working.
- [ ] Works with local artwork in the target desktop runtime, without external network access.
- [ ] Missing/invalid artwork and quick navigation behave gracefully.
- [ ] Theme caching avoids repeated unnecessary extraction.
- [ ] Tests/build/lint pass, or pre-existing failures are clearly reported.

## Instructions to Codex

**First** inspect the repository and explain briefly which existing files you intend to change. **Then implement the feature end to end.** Follow existing project patterns, keep dependencies minimal, preserve unrelated UI and playback behaviour, and do not ask for a redesign decision that this specification already settles. At the end, summarize files changed, how the palette is computed, how local artwork loading is handled, tests run, and any remaining limitations.
