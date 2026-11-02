# Status
Implementing.
# Problem and outcome
Idle scrollbars remain visible over Lyrics. Hide them when inactive, retaining scroll/drag/keyboard usability throughout Muse.
# Scope
Shared automatic scrollbar visibility, including lyrics, queues and library panes. No settings or layout changes.
# Acceptance criteria
Scrollbars reveal while scrolling/wheeling, near-edge pointer movement or keyboard focus. Hide after1second idle. Dragging keeps the scrollbar visible until release. Nested panes reveal independently. Cleanup removes listeners/timers/classes. Dimensions and scroll position remain unchanged. Respect reduced motion.
# Decisions and open questions
Use transparent thumbs, never scrollbar-width:none, so native drag targets and gutter dimensions remain stable. Square neutral thumb; CSS WebKit fallback and standard scrollbar-color. Actual native visual inspection pending if CUA remains unavailable.

## Follow-up: leftover gutter
User requests removal of the reserved scrollbar strip. Replace native gutters with zero-width native scrollbars and temporary draggable overlay indicators positioned over the pane, preserving scrolling, keyboard access, idle cleanup and stable content width. Test overlay activity/drag and zero reserved gutter styling; actual native visual check remains pending.
