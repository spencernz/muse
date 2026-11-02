# Muse implementation plan

## Steps
- [x] Read repository workflow/UI guidance and inventory the project and working tree.
- [x] Locate and inspect the supplied Muse HTML prototype and extract its visual and interaction specification.
- [x] Establish the isolated Tauri 2, React/TypeScript, Tailwind, Zustand and Rust project; verify toolchain and dependency versions.
- [x] Implement the prototype-matched desktop shell and responsive tile home.
- [x] Implement safe multi-folder scanning, supported-format metadata/art extraction, incremental SQLite indexing, and cached album art.
- [x] Implement indexed library browsing/search/sorting and virtualized track lists.
- [x] Implement native audio playback, mini-player, queue, seeking, volume, shuffle/repeat, shortcuts and media controls.
- [x] Implement playlists, favourites, history and SQLite-persisted Metro tile layout/editing.
- [x] Exercise core flows offline, inspect a large synthetic catalog, validate the native build, inspect UI against the prototype, and update this record.

## Validation
- Compare screenshots and interaction states to the supplied prototype before/after implementation at matching sizes.
- Rust unit/integration checks: library scan and re-scan changes, metadata formats, DB persistence, playlists/favourites/tiles, queue and playback.
- Frontend tests for navigation, tiles, browse/search, playback state and queue controls.
- Synthetic library benchmark with 10,000+ entries; verify background indexing leaves navigation responsive and long lists virtualized.
- Build and run Tauri offline with no Python API. Record unavailable system-level media controls or codecs honestly.
- Inspect empty, permission-denied, removable-drive-unavailable, unsupported/corrupt file and missing-artwork states.

## Progress and decisions
- The repository is an existing personal web application plus Python backend. No Tauri/Rust app or Zustand dependency exists. Muse will be isolated under its own directory so existing screens and the user's uncommitted work stay intact.
- User supplied `Downloads/muse_metro_prototype.html`; read its full source and inspected rendered Home, album details, Library filters and Now Playing. Visual measurements and intentional repository UI exceptions recorded in spec.
- Rust 1.99.1 installed via the authorized Homebrew command; Xcode present. Both native and frontend builds compile. Packaged debug builds launched; optimized build completed.
- Added WAL/FTS5 SQLite catalog, 200-row queries, virtualized lists, incremental content identity, cached embedded artwork, Rodio/Symphonia native audio and compact clock events. Original music remains read-only.
- Implemented playlist/favourite/history/queue persistence and tile reorder/resize/pin/unpin. Added root Makefile checks and desktop shortcuts.
- Dependency audit identified issues in the initially selected test runner; updated it to the patched release. New dependencies report zero vulnerabilities.
- Kept the supplied prototype unchanged in `muse/design/`. Native content fills its window, with OS-provided outer chrome. Muse retains the prototype's English dark styling independently of App Mono's appearance/localization.
- Used a separate QA bundle identifier to keep QA interaction state separate from the main app's catalog.

## Results
- `cargo test --offline -- --nocapture`: 9 native tests passed, covering codecs, embedded cover caching, source immutability, move/dedup/delete reconciliation, drive absence, preferences, FTS, playlist order and repeat/shuffle. A 12,000-track prefix search took about 1.8ms on this Mac.
- `npm test` in Muse: 8 passed, including 12,000 virtual rows with fewer than 50 mounted, paged search, single playback activation on double click, tile commands, playlist IDs, error retry, keyboard shortcuts and selection retention.
- `make typecheck` and `make lint`: passed, including the new Muse project and existing application.
- Native debug bundle: built and opened through `tauri://localhost` without a server. Inspected empty home, imported albums/embedded artwork, album metadata/tracklist, Home, Library, Now Playing, playlists and persistent player. Confirmed play/pause, seek from the range control, next-track advancement, playlist creation and tile reordering. Quit and reopened the isolated QA app: catalog, playlist, changed tile order, paused track, volume and playback position survived.
- `npm run bundle`: passed; optimized macOS ARM64 app at `muse/src-tauri/target/release/bundle/macos/Muse.app`, approximately 10.4 MiB. Release frontend and native executable compile successfully; interactive checks used the separate debug QA bundle.
- `cargo clippy --offline --all-targets -- -D warnings`: passed. Final `npm test`: 8 passed. `git diff --check`: passed.
- Visual inspection used the prototype's dark appearance and desktop native windows, including a maximized window. Narrow native window geometry was not manually exercised. Light/localized Muse variants are outside this prototype-led MVP. Physical media-key hardware, other operating systems and a live 12,000-file external drive scan were not manually exercised; media integration is implemented, codec/scanner tests and synthetic query/render checks pass.
- Handoff: open the release app and choose Import music. Source files remain read-only; library organization does not require moving files. See `muse/README.md` for development, storage and architecture. No commit requested or made; unrelated working-tree changes preserved.
