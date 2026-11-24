# Steps
- [x] `remote.rs`: split `commit` into `publish(db, selected, rows, cancel, complete)`. Partial publish upserts the source (keeping its last sync time) and rows only; complete publish also marks unseen rows unavailable and records the sync time.
- [x] `scan`: publish pending rows every 25 tracks or 2 s and emit `library-changed`.
- [x] Status copy for cancel and failure; Sync section copy in `ui/sftp.tsx`; `docs/sftp.md`.
- [x] Tests: mid-sync publication, failure after a batch keeps published and previous tracks.

# Validation
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm test -- --reporter=dot`, `make typecheck`, `make lint`
- Real sync against the user's server (user).

# Progress and decisions
- `commit` now wraps `publish(..., complete=true)`. Partial batches upsert the source row without touching `last_sync`, so the "last synced" time only reflects completed syncs.
- Each batch re-checks the selection (`check`) and the saved profile inside an IMMEDIATE transaction, as the final commit does.
- Cancel and failure now emit `library-changed` so songs from earlier batches show at once; their messages say songs found so far were kept and nothing was removed.

# Results
- `cargo test --manifest-path src-tauri/Cargo.toml`: all pass, including the new `songs_are_published_in_batches_and_an_interrupted_sync_removes_nothing` (30 files, a failing subfolder: the first 25 are available, the rest are not, the old track stays available, and `last_sync` is unchanged; a later complete sync publishes all and marks the moved file unavailable). Existing failure/cancel tests still pass.
- `npm test`, `make typecheck`, `make lint`: pass.
- Not verified: a real sync against the user's server.
