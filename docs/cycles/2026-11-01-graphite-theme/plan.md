# Steps
- [x] Set exact neutral tokens and isolate global default from playback artwork.
- [x] Remove static color casts in default UI while retaining artwork atmosphere.
- [x] Run relevant theme tests, typecheck/lint and release bundle.
- [ ] Visual signoff when native inspection becomes available.
# Validation
Existing artwork update/fallback tests must distinguish fixed global accent from dynamic Now Playing. Contrast tests continue to validate derived themes. Check static palette and build. Attempt actual UI inspection; record any unavailable service.
# Progress and decisions
Read parent workflow and UI rules. Default blue is both a CSS token and fallback atmosphere; App also paints the global accent from artwork. Fix both sources. Static CSS contains purple-tinted backgrounds/secondary text beyond the tokens.
# Results
- `npm run typecheck` and `npm run lint`: passed.
- `npm test -- src/album-atmosphere.test.tsx src/ui/app.test.tsx`: 39 passed. Updated old blue/global-artwork expectations to Graphite; dynamic Now Playing and contrast tests pass. User clarified that global playback accents must still follow artwork; restored artwork-driven global accent with Graphite fallback.
- Static default CSS colors were neutralized, retaining alpha and relative luminance. Exact palette tokens replace the generated defaults; native initial window background is #151515.
- Initial desktop build is running. Final combined build includes the stable Lyrics panel correction and specific LRCLIB HTTP diagnostics. User clarification restores artwork accents globally; Graphite is the no-cover/neutral-cover fallback.
- `cua.getState()` failed: Sky Computer Use native pipe startup failed. Desktop/minimum-width visual signoff remains pending.
- No commit requested or made.

Final combined `npm run bundle -- --bundles app` passed (18.66 MiB), with artwork accents restored, Graphite fallback and stable Lyrics tabs. Final focused run: 41 tests passed plus typecheck/lint; native lyrics matching test passed. No actual native visual verification was possible.
