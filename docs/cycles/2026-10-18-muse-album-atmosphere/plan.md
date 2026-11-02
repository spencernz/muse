# Steps
- [x] Inspect album, artwork, runtime, player actions and UI conventions; save brief/spec.
- [x] Implement quantized palette selection, contrast validation, bounded cache and race-safe hook.
- [x] Integrate hero and scoped square-edge themed styles without changing handlers.
- [x] Test extraction, caching, navigation races and album actions; inspect responsive UI.
- [x] Run checks and review final task files.
- [x] Apply user's follow-up request: audit all Muse surfaces, remove rounded geometry throughout, and unify shared outlined button styles including native range/checkbox rendering.

# Validation
Unit tests cover warm/cool/pale/neutral/busy samples, contrast, failed loading, canvas security errors, cache reuse and rapid navigation. Existing UI tests plus album interaction coverage protect playback and library operations. Inspect synthetic album pages at desktop and narrow widths, including focus, missing artwork and reduced motion. Run Muse tests/build/lint and root typecheck/lint.

# Progress and decisions
Existing artwork is restricted to app-data artwork via Tauri; filenames are content hashes. Use the same resolved source for both images and canvas; no external service or dependencies needed.

User approved the album button design in a screenshot and requested the same square geometry throughout Muse. Expand shared CSS only; preserve screen structure and controls. Native window chrome and operating-system file pickers remain system controlled.

# Results
Implementation files: `muse/src/album-atmosphere.ts`, `use-album-atmosphere.ts`, `album-atmosphere.css`, `metro.css`, `main.tsx`, `ui/library.tsx`, `ui/app.tsx`, `ui/app.test.tsx`, `album-atmosphere.test.tsx`, `styles.css` and `desktop.css`. Existing handlers and native/database contracts retained. Album screen is keyed by identity so selection, dialogs and palette transitions cannot transfer between albums.

Palette: sample 48×48 pixels, ignore transparent/near-black/near-white/neutral pixels, accumulate saturation-weighted quantized RGB buckets and select the most populated bucket rather than averaging unrelated hues. Derive coordinated dark surfaces and lighten accents/muted colours to exceed 4.5:1 contrast (with rounding margin). Choose the highest-contrast light/dark action foreground. Neutral fallback for monochrome, absent or unreadable artwork. Cache 128 completed identities; share in-flight requests, time out after 10 seconds, remove image handlers, and ignore abandoned hook results.

Native inspection found that visible asset images still taint a canvas without explicit CORS. Sampling now sets `crossOrigin="anonymous"` before `src`; the installed Tauri asset handler already supplies the correct allow-origin header. Confirmed album-specific colours in the native WebKit runtime after this fix. Foreground/hero both reuse `artwork()`/`convertFileSrc()` and the existing restricted app-data artwork scope; no network service or CSP expansion.

Checks:
- `cd muse && npm test`: passed, 17 tests, including palette contrast and representative hues, neutral fallback, failures/CORS, cache sharing/eviction, stalled-load cleanup, navigation/unmount races and album play/shuffle/favourite/pin/playlist/selection/back actions.
- `cd muse/src-tauri && cargo test --offline`: passed, 9 tests across queue, codecs and library integration suites.
- `make typecheck`: passed (frontend and Muse).
- `make lint`: passed (backend, frontend and Muse).
- `cd muse && npm run bundle`: passed against the final changes, including the sidebar line-height adjustment. Production bundle is `muse/src-tauri/target/release/bundle/macos/Muse.app`.
- Isolated native debug builds via `npm run tauri -- build --debug --bundles app --config '<QA identifier, productName and window overrides>'`: passed; test catalogs are outside the repository and isolated from the main library.
- `git diff --check`: passed. Task files manually reviewed; existing unrelated changes preserved. Muse was already untracked at the start; no staging or commits performed.

Visual inspection: native `tauri://localhost` album view with GUTS, 1989 (Deluxe Edition), and The Life of a Showgirl at desktop width 1180px; stacked GUTS at 620px and pale-cover layout around 466px. Confirmed crisp square covers, distinct purple/beige/olive themes, readable metadata/actions, continuous hero-to-tracklist fade and no blur on foreground. Broken/missing artwork fallback was also visible in the isolated home catalog. Final shared-style preview confirmed square shell inputs/import buttons, player artwork/transport, track checkboxes and slider rails/thumbs. Home/library/playlist/settings/queue/dialog selectors were audited against the global square reset; no nonzero CSS radius remains. Primary actions stay filled and secondary actions use the approved outlined treatment. Only inset navigation selection divider remains as a box-shadow; cover/dialog drop shadows removed.

Limits: runtime inspection performed on macOS in Muse's existing dark/English appearance; other platforms are untested. The final preview opened at 320px but was resized before its screenshot, so exact 320px visual QA remains unconfirmed. Reduced-motion and forced-colour rules were inspected in code, without changing system accessibility preferences. Native macOS window chrome, system file pickers and OS menu popovers retain OS geometry.
