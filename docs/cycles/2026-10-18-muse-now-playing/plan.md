# Steps
- [x] Inspect existing player, state/actions, local artwork, palette/cache and UI rules.
- [x] Share artwork-derived tokens at the app shell for expanded screen/sidebar/bottom bar.
- [x] Redesign existing Now Playing composition, actions, transport, seek and queue access; retain empty state and race-safe track actions.
- [x] Add scoped cinematic/responsive styles and compact persistent player presentation.
- [x] Add meaningful interaction regressions; verify native desktop/narrow layouts and fallback states.
- [x] Run tests, typecheck, lint and production bundle; review task files and complete notes.

# Validation
Existing palette tests cover colour contrast, failures, CORS, caching and navigation races. Add UI tests for expanded transport, pointer/keyboard seek, volume, favourite/playlist identity across track changes, sidebar/album/artist navigation, queue reachability, missing art and empty state. Inspect actual native app at desktop and narrow widths using an isolated QA catalog with local artwork and a playable fixture, long text and missing art. Run `npm test`, `make typecheck`, `make lint`, and `npm run bundle`. No backend contract changes or migrations.

# Progress and decisions
Use the existing Album Atmosphere hook once in App to publish current-playback tokens to the shell; the album page retains its own scoped palette. Current-song tick state remains in Zustand and existing seek/volume controls keep their native commands. Avoid duplicating transports or large progress bars in the footer while the expanded view is open. Preserve the queue below the main listening composition and make footer queue navigation scroll/focus it.

# Results
Passed: `npm test` (22 tests), root `make typecheck`, root `make lint`, and `npm run bundle`. Native macOS inspection used isolated synthetic catalogs at 1440×960, 1180×800 and 320×800: square local artwork, long titles, missing artwork, filled seek with click/drag, volume and queue focus verified. Final 1180×800 build verified hidden Now Playing top bar, search icon elsewhere and full-width sidebar rows. One existing native Rodio engine retained; no new output-device API. Production bundle: `muse/src-tauri/target/release/bundle/macos/Muse.app`. Windows/Linux visual verification unavailable on this host.
