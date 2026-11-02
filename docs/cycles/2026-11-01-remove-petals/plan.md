# Steps
- [x] Remove mode/engine/selector references, preserve generic artwork loader and saved preference migration.
- [x] Delete unused Petals code, tests and artwork; adjust meaningful mode/resolution tests.
- [x] Run tests/build, sign/relaunch combined release, inspect if native UI available.
# Validation
Mode list, preference migration, absence in UI, unchanged Chalk Zoo texture loading and 4K cap; existing frontend suite and production bundle. Native visual surface availability recorded.
# Progress and decisions
User explicitly requested removal while Chalk Zoo expansion and prior Retro/scrollbar fixes were being finished. All changes combined in one new release.
# Results
Pending.

Removed Petals from type/selector/engine/shuffle, deleted its renderer/test/artwork file, preserved generic texture loader for zoo sprites. Old `petals`/`nebula` saved preference now resolves to Spectrum. Mode migration and UI tests pass. `npm test`:136 passed, typecheck/lint passed. Bundle building.

## Final combined release
`npm test`:136 passed; `npm run typecheck`, `npm run lint`, `npm run bundle -- --bundles app`:passed. Bundle 50.03MiB. `codesign --verify --deep --strict --verbose=2`:passed. Replaced current app, old PID30425 terminated, new PID32528 verified. Native CUA again returned `Sky Computer Use native pipe startup failed`, so visual appearance remains unverified; implementation and delivery done. No commit made.
