# Muse local desktop player

## Status
Complete for the macOS MVP. The supplied prototype was inspected before implementation; native and frontend checks pass and the optimized app is packaged. Device-specific verification limits are recorded in the plan.

## Problem and outcome
Build a local-first desktop music player named Muse. Users can index folders of music, browse and search their collection, create playlists and favourites, and play audio while seeing a Metro tile home screen and persistent mini-player. The supplied HTML prototype is the visual and interaction source of truth.

## Scope
Build Muse as an isolated Tauri 2 + React + TypeScript + Tailwind desktop app within this repository, with Rust filesystem, metadata, SQLite and playback services; Zustand for client state. Keep the current App Mono web app, Python API and existing user changes intact. Work in increments: shell and faithful UI, persistent local catalog and incremental scans, browse/search, playback and queue, then playlists/favourites, pinned/resizable/reorderable tiles, and keyboard/system media controls. Support 10,000+ tracks with indexed SQLite queries, background work, and virtualized track lists. Supported codecs follow verified engine support; never change source audio files.

## Acceptance criteria
- Inspect and document the provided prototype before changing application code; preserve its layout, proportions, type, colors, tile states, hover/transition behavior and interactions. Do not substitute a conventional streaming-service layout.
- Launch Muse offline with no Python API or hosted account.
- Select multiple local source folders and incrementally index supported files, embedded tags and artwork into a persistent SQLite catalog. Report unavailable volumes and per-file failures. Re-scans update additions, modifications, moves and deletions without duplicating tracks.
- Display album, artist and track metadata and artwork; browse albums, artists, tracks, playlists and genres; search and sort by title, artist, date added and year.
- Play, pause, seek, skip, set volume, shuffle/repeat, manage the queue, use keyboard/system media controls, and keep a mini-player visible across screens.
- Create, rename and remove playlists; favourite/unfavourite tracks; persist playback history and user-owned metadata independently from source files.
- Create and edit Metro home tiles (small 1×1, medium 2×2, wide 2×1); persist order, dimensions and pinned item in SQLite.
- Cover and play MP3, FLAC, WAV, M4A/AAC and ALAC if supported by the chosen engine; never claim an unsupported codec works.
- Run validation for Rust and frontend; visually inspect the app against the supplied prototype and test a 10,000+ track synthetic catalog without UI stalls.

## Decisions and open questions
- Reference: `design/muse_metro_prototype.html`, supplied by the user. Read full HTML/CSS/JS and inspected rendered Home, Library, Album and Now Playing navigation. Preserve 206px sidebar, 66px top bar, 26px/30px content padding, four-column dense tile grid with 9px gutters, charcoal #111218/#171820, lavender #b99df4, square artwork, 194px detail cover, and persistent bottom player. Preserve responsive breakpoints at 750px/460px.
- Explicit visual exceptions to repository UI rules: this separate desktop app follows Muse's prototype instead of AppShell/PageContainer, including 13px outer chrome, 7px navigation corners, 12–13px compact metadata, colored tile surfaces and artwork gradients. Prototype fidelity takes precedence per user instruction. Use system fonts offline; respect reduced motion and improve control labels/focus semantics.
- Create `muse/` as a standalone application. Use Rodio 0.21 + Symphonia codecs for Rust playback, Lofty for tags, rusqlite in WAL mode, Souvlaki for OS media controls, and background filesystem change detection. Dependency APIs checked against primary documentation.
- User authorized installing Rust through the explicit Homebrew approval. Xcode is present.
- Preserve all pre-existing working-tree changes; do not stage or commit unrelated tasks.
- Organize internal Rust modules around library scanning, metadata/artwork, indexed SQLite repositories and audio playback; expose narrow Tauri commands. Keep user-specific app state in Tauri's app data directory, cached art derived from embedded artwork, and sources read-only.
