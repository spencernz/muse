# Steps
- [x] Add confined read-only remote file access and verified profile snapshots.
- [x] Add additive remote catalog tables and cancellable, bounded recursive metadata sync.
- [x] Add bounded worker audio input to existing player with seeking and failure reporting.
- [x] Add Metro Sync controls/progress and Remote labels to catalog/player.
- [x] Test regressions and inspect desktop Sync/catalog/player states.
- [x] Build the final release application.
- [ ] Inspect minimum supported width (native resize automation unavailable).

# Validation
Native tests with fake remote sessions and synthetic audio cover confinement, trust, metadata mapping, incremental sync, cancellation, transaction failure isolation and buffered playback. Frontend tests cover Sync states and Remote labels. Run cargo fmt, cargo test, npm typecheck/lint/test/build and Tauri release build. Inspect desktop and minimum supported width; record unavailable appearance checks.

# Progress and decisions
Repository inspected: React/Zustand frontend, SQLite catalog, read-only SSH connection service, Lofty metadata, one Rodio player. Remote metadata will live in the shared tracks table with separate remote locations so local scanning cannot change it. No new large dependencies. Shared Lofty tag mapping is reused by local and remote readers. Sync snapshots the saved profile/trust, stages metadata and commits atomically, retaining earlier data on failure/cancel. Audio worker uses bounded nonblocking PCM prefetch and generation-based seeks; no audio cache is created.

# Results
- `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: **43 passed**, one opt-in live test ignored. A sandboxed run could not bind the existing HTTP tests' local sockets; the network-capable rerun passed. Includes raw AAC/ALAC, same-source key-file changes, metadata/artwork, incremental identity/preferences, cancellation/failure isolation, migration, bounded prefetch, underruns and generation-based seeks.
- `npm test -- --reporter=dot`: **67 passed**. Existing React virtualizer `flushSync` warnings remain.
- `npm run typecheck`, `npm run lint`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: **passed** against final code.
- `npm run bundle -- --bundles app`: **passed**, final Muse.app rebuilt (18.20 MiB), including AAC, restore-position and key-path fixes. Existing upstream Rust `block` future-compatibility warning remains.
- Live desktop at **1180×800 CSS px**, dark Metro appearance: Sync progress/cancel and saved root readable; catalog published successfully; Remote labels visible alongside local albums; remote playback and seeking observed in the existing bar (track clock beyond three minutes). Preserved the selected folder and left active user playback running. The latest AAC, restore-position and key-path fixes load on the next app restart.
- Minimum-width visual verification remains **pending**: native resize automation rejected the action when the app context changed, and a later accessibility capture timed out. No light theme or translations exist in this standalone app. Automated checks do not replace this missing visual sign-off.
- Reviewed task code/docs for accidental personal endpoints, keys and tokens: none added. Local/Plex tests still pass. No commits created; the parent working tree contains pre-existing unrelated changes and the standalone Muse directory is untracked there.

Use **SSH / SFTP → Use this music folder → Sync catalog → Open library**. Audio stays remote; only metadata and artwork are cached. See [setup and security](../../sftp.md).
