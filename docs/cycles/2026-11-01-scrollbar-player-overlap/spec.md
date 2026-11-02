# Scrollbar indicator stays within its pane

**Status:** implementing

## Problem and outcome

Muse can paint a temporary scrollbar indicator below the visible scroll pane, over the bottom player. Scrolling the queue or main content should keep each indicator inside the visible portion of its own pane.

## Scope

Fix overlay scrollbar placement and activity detection. Preserve scrolling and thumb dragging. No other layout redesign.

## Acceptance criteria

- A nested pane extending below the main content viewport cannot paint a horizontal indicator over the bottom player.
- Visible vertical indicators stay within the clipped viewport and remain draggable.
- Indicators appear only for axes that can scroll and clear after inactivity.
- Muse tests, typecheck, lint, and production build pass; the desktop bundle is refreshed.

## Decisions and open questions

Use actual clipping ancestor bounds and the viewport to constrain document-level scrollbar overlays. The screenshot is the primary visual report; native UI automation may be unavailable.
