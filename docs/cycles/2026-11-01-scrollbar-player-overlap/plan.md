# Plan

## Steps

- [x] Inspect scrollbar implementation and content/player layout.
- [x] Add regression coverage for clipped nested panes and scrollable axes.
- [x] Constrain overlay position and dragging to the visible pane area.
- [ ] Run tests and build, refresh desktop app, review source and staged changes.
- [ ] Run repository commit gates, commit scoped Muse files, and push if checks pass.

## Validation

Run the scrollbar Vitest tests, Muse test/typecheck/lint/build, and root `make typecheck` and `make lint` before commit. Inspect the desktop UI at the affected window size if native UI control is available.

## Progress and decisions

The fixed-position overlays are appended outside nested scroll panes and used the full pane rectangle, which can extend past the clipped main content and player boundary. Overlay positions now intersect the pane with clipping ancestors and the viewport. A horizontal thumb is hidden when its bottom edge is clipped; vertical thumbs use the visible track. An axis with no scrolling behavior no longer creates a visible thumb. The two regressions failed before the fix and pass after it.

## Results

Pending.
