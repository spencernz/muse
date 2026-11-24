# Status
Implementing.

# Problem and outcome
A remote (SSH) catalog sync reads every file before it saves anything, so a library of hundreds of songs shows nothing until the whole sync finishes ("Checking remote catalog · 376 files"). Users want to browse and play songs while the sync is still running.

# Scope
Included:
- Save found tracks in small batches during a sync and refresh the library after each batch, so new songs appear and can be played while the sync continues.
- Removals stay all-or-nothing: tracks missing from the server are marked unavailable only after a complete, successful sync.
- A failed or cancelled sync keeps the songs already saved and removes nothing.
- Status and docs explain the new behaviour.

Excluded: parallel tag reading, sync speed changes, changing the 500-entry/10,000-track limits.

# Acceptance criteria
- During a sync, tracks become available in batches (at most 25 tracks or about 2 seconds after they are read), and the library refreshes.
- After a sync fails part-way, tracks saved by earlier batches stay available, and previously synced tracks not yet re-checked stay available.
- A completed sync still marks files no longer on the server unavailable while keeping favourites, playlists and history.
- Batches never publish for a stale selection (profile or trust changed): the batch is rejected as before.
- Existing remote catalog tests pass; new tests cover mid-sync publication and failure after a batch.

# Decisions and open questions
- The user asked to load music during a sync (2026-11-24). This replaces the earlier rule that failed/cancelled scans publish nothing; the safety rule kept is that nothing is ever removed by an incomplete sync.
- Batch size 25 tracks or 2 seconds keeps SQLite transactions short and library refreshes infrequent (the frontend already debounces `library-changed` by 150 ms).
