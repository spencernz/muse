# Implementation plan

## Steps
- [x] Inspect Muse AI, catalog, playlist persistence and UI conventions.
- [x] Add validated native AI selection and atomic playlist persistence with tests.
- [x] Add shuffled mood dialog, sidebar playlists and frontend behavior tests.
- [x] Run Rust/frontend checks and review scope.
- [ ] Inspect desktop/narrow UI and keyboard focus in a real window (desktop automation unavailable).

## Validation
Rust fake-wire tests cover candidate privacy, limits, refusal/failure, unknown and duplicate selections, no partial writes and persisted order. Frontend tests cover mood choices, loading, errors and navigation after confirmed creation. Run Muse tests/build/lint, cargo tests and root typecheck/lint. Inspect desktop/narrow layout and keyboard behavior if desktop automation is available.

## Progress and decisions
Reusing existing AiConnection and SQLite playlist tables. This task is in app-mono-001/muse, separate from FlowPilot; existing uncommitted work remains untouched.

## Results
- `cd muse && npm test`: passed, 85 tests including six new playlist UI tests.
- `cd muse/src-tauri && cargo test --offline`: passed, 69 tests; two existing opt-in network tests ignored. Five new playlist tests cover ordered persistence/privacy, invalid output/provider errors, empty/concurrent requests, write rollback and source changes. One earlier combined formatting/test command denied loopback binding in three existing provider transport tests; the standalone approved cargo command rerun passed the complete suite.
- `make typecheck`: passed for both frontend applications.
- `make lint`: passed for backend, web frontend and Muse.
- `cd muse && npm run build`: passed.
- Rust formatting applied only to the changed files. Scoped `git diff --check` passed (Muse is already an untracked project in this working tree).
- `cd muse && npm run desktop`: Vite started and Cargo launched `target/debug/muse`, then the command exited successfully. No window could be observed, so this is a startup attempt, not proof of UI operation.
- Desktop UI inventory and direct Muse selection both failed with `Sky Computer Use native pipe startup failed`. Desktop/narrow visual inspection, focus restoration and live OpenAI generation remain unverified; no credentials were extracted or billed request made. Automated dialog interaction and navigation tests passed.
- No commit created: the new task did not request one, and unrelated existing work is preserved.
