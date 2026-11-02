# Status
Implementing.

# Problem and outcome
Opening the queue can shift hidden ancestor scroll containers, leaving a bottom gap and clipping the album cover even after scrolling the content back up. Queue navigation should move only the main content viewport.

# Scope
Queue navigation and Now Playing artwork clipping. Preserve the existing Muse appearance, queue controls, focus and reduced-motion behavior.

# Acceptance criteria
- Queue clicks, including navigation from another page and repeated clicks, scroll only main content and focus the queue without further scrolling.
- Returning main content to the top leaves the full cover accessible and the footer in place.
- Decorative artwork stays clipped without introducing an additional scroll container.

# Decisions and open questions
Use explicit main-content scrolling rather than scrollIntoView, which can move hidden overflow ancestors. Keep the existing dark, English Muse design as documented in its README. Native visual verification remains required; jsdom cannot validate layout.
