# Status
Implementing; code and automated checks finished, visual verification pending.

# Problem and outcome
Make Now Playing immersive across the full app window, make mini-player artwork expansion discoverable, and give its cover-derived blurred backdrop continuous movement.

# Scope
Hide sidebar and footer in Now Playing. Add a top-right close button and Escape dismissal, returning to the previous page with keyboard focus restored. Add a hover/focus expand icon to mini-player artwork. Animate the existing blurred cover with slow transform motion; preserve readability and reduced-motion support. No OS fullscreen or playback changes.

# Acceptance criteria
- Now Playing occupies the full workspace without sidebar or footer, including empty playback.
- Close and Escape return to the previous page (Home when no history), preserve playback, and restore usable focus. Escape inside a dialog dismisses only the dialog.
- Mini-player artwork shows an expand icon on hover and keyboard focus, and on touch devices. Its existing accessible name and activation remain usable.
- Background movement comes from the current cover, updates when tracks change, respects reduced motion, and has a safe fallback for missing/broken artwork.
- Playback, queue, long titles and narrow layouts remain usable. Verify desktop and 320px layouts in the existing dark appearance.

# Decisions and open questions
Preserve Muse's standalone dark English UI and existing component system. Requested blurred atmosphere and slow continuous motion intentionally override shared UI defaults against decorative backgrounds/motion. Use the existing route history, not a modal or OS fullscreen. This cycle lives under Muse's docs directory, within the authorized workspace; shared workflow/UI rules were read from ../docs. No commit requested.

Follow-up acceptance criterion: Close must match the existing Back button: 48px square, zero corner radius, identical border, surface and hover treatment. Reuse the same CSS rule so the controls remain consistent.
