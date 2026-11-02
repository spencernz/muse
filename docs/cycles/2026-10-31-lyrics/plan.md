# Steps
- [x] Implement bounded native lookup, identity validation, memory cache and imported overrides.
- [x] Implement accessible tabs, synced/plain lyrics and existing-player seek.
- [ ] Run focused tests/checks and release build; record UI verification.
# Validation
Use synthetic lyrics for parser/seek tests and fake response identity tests; no copyrighted text in repo. Check tabs and stale fetch behavior. Typecheck/lint/native checks and release bundle. Native visual verification attempted if service available.
# Progress and decisions
Read parent workflow/UI rules. Existing code has no lyric model. Source research supports LRCLIB plain/synced fields and duration matching; use exact endpoint only. Imports accept LRC or text and are kept as local overrides.
# Results
- Native `cargo test --manifest-path src-tauri/Cargo.toml --lib lyrics --quiet`: one matching-validation test passed.
- `npm test -- src/ui/app.test.tsx src/ui/lyrics.test.tsx src/lyrics.test.ts`: 34 passed, including tab keyboard/panel behavior, no lookup until tab opens, existing player seek, stale responses and LRC parsing.
- `npm run typecheck` and `npm run lint`: passed.
- `npm run bundle -- --bundles app`: passed, release Muse.app 18.66 MiB.
- Public LRCLIB probe returned HTTP 503; live successful lyrics retrieval was not verified. No lyrics text was printed or committed. UI reports this temporary failure with Retry and import options.
- Native inspection attempted: `cua.getState()` failed with “Sky Computer Use native pipe startup failed.” Desktop/620px visual signoff remains pending.
- No commit requested or made.

# Stable tab follow-up
- [x] Remove lyrics footer and reserve common panel height with hidden details still contributing layout.
- [x] Verify tab behavior and rebuild with Graphite fallback/artwork colors.

# LRCLIB outage investigation
Curl reproduced HTTP 502 with Cloudflare headers and body `error code: 502`, independently of Muse. Search (synthetic title), get-by-ID (no song metadata) and cached lookup also returned 502. Original exact-song request previously returned 503. Candidate causes: provider backend, regional route, request formatting. Unrelated endpoints eliminate song metadata as a necessary condition. Browser User-Agent plus Accept: application/json also returned 502. Native safe error now includes LRCLIB and HTTP code. Native matching regression passed. Do not claim a global outage without independent region evidence. Fix diagnostic copy; external availability cannot be repaired locally.

Stable-tab checks: `npm run typecheck`, `npm run lint` and 41 relevant tests passed. Automatic line scrolling is now confined to the lyrics list, avoiding ancestor-page scroll. Combined release rebuild passed: Muse.app 18.66 MiB. Provider remains externally unavailable from the tested route; not a verified successful live lookup.
