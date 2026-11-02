# Status
Implementing.

# Problem and outcome
Muse's sidebar, toolbar, album hero and player feel disconnected. Refactor layout composition and styling into a unified Metro canvas while preserving the existing local music library and playback behavior.

# Scope
Use the existing React/Zustand/Tauri components, routes, icons and event handlers. Make the sidebar and independently scrolling content sit above a universal full-width player. Put Back, breadcrumb, search and import inside content. Use square controls and opaque charcoal surfaces in navigation, library and player. Per the user’s follow-up, restore cover-tinted blur inside album heroes as well as Now Playing. Separate recognized edition/disc suffixes for display without changing stored music metadata. No new dependencies, lyrics feature or audio/backend changes.

# Acceptance criteria
- Player is a sibling of the upper shell and spans the complete window, with the sidebar ending above it.
- All pages retain player transport, seeking, time, volume, mute and queue controls. Existing square-thumb progress/volume implementations and handlers are preserved.
- The independent toolbar is removed. Contextual navigation inside content offers working Back, breadcrumbs, search and import, including busy/error behavior.
- Album hero has square prominent artwork, bold main title, distinct edition/disc subtitle, artist/year and track count/duration/genre. All album actions and track interactions remain available.
- Sidebar remains branded, uses existing accent colors, and collapses to an icon rail at narrow widths. No horizontal overflow or overlapping player controls at desktop widths; smaller widths wrap controls.
- Navigation, library and footer have solid backgrounds, square corners and restrained separators. Album heroes restore the previous cover-tinted blur; Now Playing must visibly follow the current cover palette, including its own controls.
- Queue scrolling fix remains intact, including returning to the full cover after queue navigation.
- Verify navigation, search/import, playback, seeking, volume and queue via relevant tests; visually inspect wide and narrow layouts and keyboard access.

# Decisions and open questions
User's square geometry, dark-only Muse appearance and cover-tinted album/Now Playing exceptions take precedence over generic shared frontend UI rules. Muse is a standalone English desktop app, not the translated App Mono frontend; retain its CSS and components. Keep Now Playing's larger transport as well as the universal footer. New Back history is in-memory and uses existing routes. Search stays visible for discoverability rather than adding an expand step. Preserve all existing album actions directly rather than introducing a new overflow menu.

Follow-up: user reviewed the rebuilt album page and prefers its earlier cover-tinted atmosphere. Keep the new shell/player and restore that effect. User also reports Now Playing no longer follows cover colors; restore its scoped control colors and make the cover tint apparent.
