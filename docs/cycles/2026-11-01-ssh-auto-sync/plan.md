# Steps
- [x] Inspect existing incremental scanner, SFTP readdir attributes, saved profiles and settings UI.
- [x] Persist validated automatic interval preferences and native scheduling with no overlap.
- [x] Preload fingerprints once; skip unchanged files using directory listing facts.
- [x] Add compact SSH settings controls and reused-file progress.
- [x] Test repeated/changed/deleted files, no-open fast path, scheduling and failure retention; run full checks/build.
- [ ] Physically verify Settings UI and real-server sync after enabling automatic sync.
# Validation
Native fake SFTP counters verify no open/read on unchanged scans, changed-file updates and stable IDs. Scheduler decisions cover disabled/missing profile/busy/interval/failure/cancel behavior. Frontend settings tests verify saving and error states. Existing remote provider suite verifies trust/failure/deletion isolation. UI inspection depends on native computer-use service.
# Progress and decisions
The original scanner skips tag reads after opening every file and issuing one SQLite connection/query per file. Readdir already has size and mtime; retain both, query known facts once per scan, and avoid per-file opens for matches. Disconnect clears the profile, so the scheduler naturally stops accessing it.
# Results
- Native full suite: 80 passed, 2 live-network cases ignored. Incremental regression asserts zero additional file opens or bytes read for a repeated scan, changed tags retain track/favourite/playlist identity, missing timestamps use open/stat without tag reads, incomplete scans preserve prior catalog, and disconnected/failed schedules do not immediately retry.
- Frontend suite: 108 passed. Automatic settings save toggle/interval and retain previous values with a recoverable error after save failure.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm run bundle -- --bundles app`: passed. Release bundle ad-hoc signed as `local.muse.player`, strict signature verification passed, and exact bundle launched successfully. Native UI/real-server verification pending: native computer-use pipe unavailable. No credentials or server data used in tests.
- Directory traversal remains necessary on SFTP; same size plus preserved mtime cannot detect an edit. The process runs only while Muse is open, including background mode. Native scheduler polls preferences every 15 seconds and waits the chosen interval after success/failure/cancel. No schema migration required: existing settings storage accepts the new key; optional directory timestamp and unchanged-count responses are additive.
Cycle remains implementing until physical UI and real-server acceptance checks can be completed.

Release process verification: previous Muse process terminated, exact rebuilt bundle reopened; process 13136 runs `src-tauri/target/release/bundle/macos/Muse.app/Contents/MacOS/muse`. No commit made.
