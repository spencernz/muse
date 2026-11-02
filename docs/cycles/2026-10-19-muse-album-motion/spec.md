# Status
Implementing.

# Problem and outcome
Opening an album should feel like moving forward through a Metro tile surface. Add selection emphasis, distance-staggered scatter, shared artwork travel, coordinated detail entrances and a meaningful reverse on Back in the existing application.

# Scope
Native Web Animations API and transforms, no new dependencies or audio changes. Match artwork using stable album IDs. Preserve origin route, grid sort/tab and scroll position. Clip temporary visuals to main content; sidebar/footer never move. Clean up on interruption, rapid clicks, resize, reduced motion and unmount. Missing/offscreen artwork uses graceful immediate/fade fallback. Keyboard activation uses the same path and restores focus.

# Acceptance criteria
- Album cards from existing grids open with 120ms emphasis, outward staggered scatter and approximately 400ms shared artwork travel to the real hero rectangle.
- Source and destination artwork are hidden only while the temporary shared artwork is active, with no aspect-ratio distortion or duplicate accessible controls.
- Artist/title, metadata, actions and tracklist enter in groups; large lists are not animated row-by-row.
- Back fades details out, restores the originating grid and its scroll/filter/sort, flies the artwork to the matching current tile and returns surrounding tiles. Missing source tiles fall back gracefully.
- Rapid clicks/interruption/resize/reduced motion leave no clones, hidden real content or stale delayed navigation. Only visible grid neighbors are measured/cloned.
- User follow-up overrides the solid-album requirement in the initial animation brief: extend the existing cover-tinted album background behind the contextual Back/breadcrumb/search/import row, removing the hard horizontal background break. Sidebar/player stay solid.
- Back uses a 48px square button with visible borders and keyboard focus (reduced from the first 56px version after user review).
- Latest follow-up: hide the entire footer on Now Playing. Reuse its existing volume/mute implementation inside the immersive playback controls, with queue access retained there. Other pages retain the stationary full-width footer.
- Home artwork-tile captions appear on hover or keyboard focus, leaving covers unobscured at rest. Keep accessible names; show captions on non-hover devices.
- Existing playback, queue scrolling, import, search, navigation and album actions still work. Verify relevant tests and current release build; distinguish native visual verification from mocked animation checks.

- Follow-up: the cover-tinted backdrop must cover the entire scrolling tracklist without a horizontal cutoff.
- Follow-up: preserve uninterrupted artwork visibility through animation completion and image decoding, including delayed browser animation frames.

# Decisions and open questions
Preserve Muse's existing dark English standalone UI. The requested long Metro transitions are an intentional exception to the shared UI guide's default brief transitions. Latest user follow-ups retain album blur and immerse contextual navigation in it; only sidebar/player remain solid. No commit requested.
