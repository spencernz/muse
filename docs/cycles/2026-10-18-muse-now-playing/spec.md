# Status
Complete.

# Problem and outcome
Now Playing should feel like entering the current album's visual world: cinematic artwork, sharp Metro geometry, editorial track information and calm, accessible playback controls in the existing Muse application.

# Scope
Existing NowPlayingScreen, shared transport/seek UI, persistent bottom player, and scoped sidebar appearance. Reuse Album Atmosphere sampling/cache and native artwork handling. Preserve native audio/database contracts, navigation, keyboard shortcuts, favourites, playlists, queue operations, seek, volume, shuffle and repeat. No dependencies or output-device APIs added.

# Acceptance criteria
- Current artwork fills a blurred atmospheric content background, with readable dark overlays and album-dependent cached colour tokens; missing/broken artwork uses a neutral fallback without stale themes.
- Wide desktop layout features crisp square art (up to 520px) and large naturally wrapping track title, artist navigation, uppercase album navigation and useful metadata. Medium layouts scale down; narrow layouts stack without horizontal overflow.
- One prominent square Play/Pause transport supports previous/next/shuffle/repeat, with album accent active states. Favourite and playlist actions retain behaviour.
- Thin progress rail shows accent fill, square handle, elapsed/total times and working pointer/keyboard seeking. Changing tracks resets draft seek state.
- Persistent bar stays visible with square art, song/artist, volume/mute and queue access. Expanded Now Playing suppresses duplicated transport/progress; volume and queue remain available at narrow widths.
- Sidebar stays dark and legible, with an album-accent vertical active-route marker. Following the user's screenshot request, navigation rows/highlights span the full sidebar width while icon/label alignment and visible inset focus remain intact. Queue access reaches the existing queue and all queue actions remain available.
- All geometry is square. Motion is limited to restrained 150ms hover and 400ms theme/artwork fades; reduced-motion disables it. Focus remains visible.
- Hide the top bar on Now Playing per the user's follow-up screenshot. Other routes retain search/import, with a decorative search icon inside the search field and its accessible label unchanged.
- Relevant tests, root checks and production build pass. Inspect native desktop and narrow Now Playing, including missing art and long text.

# Decisions and open questions
The user's cinematic gradients, tinted dark backgrounds, glass surfaces, large display typography and zero-radius geometry intentionally override general UI defaults. Keep Muse's existing dark/English appearance rather than introducing new appearance/i18n systems. The audio backend does not expose device selection, so preserve supported volume and queue controls without adding a decorative nonfunctional output selector. Use one expanded transport; the action row contains Favourite and Add to playlist to avoid a second Play/Pause button. Playlist dialogs retain the track identity for which they were opened, even if playback advances.
