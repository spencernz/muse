# Status
Implementing.
# Problem and outcome
Remote-only listeners need automatic library updates without downloading or re-reading every music file. Repeated syncs must preserve stable identities and avoid duplicates.
# Scope
Opt-in automatic catalog sync while Muse runs, configurable 5/15/30/60 minute interval in SSH settings. Read-only directory traversal uses SFTP directory-entry size/mtime to skip opening unchanged files. Cache catalog fingerprints in memory for each scan. Unknown timestamps fall back to safe file checks. Detect additions, changes and missing files transactionally; never remove the catalog after an incomplete or failed scan. No audio downloads, remote writes or server watcher installation.
# Acceptance criteria
- Automatic sync persists across app restarts; off by default, selectable interval.
- Manual and automatic work cannot overlap. Failed attempts respect the interval; cancellation does not immediately restart.
- Disconnection or missing/changed trust prevents automatic access; existing SSH validation remains enforced.
- An unchanged repeat scan lists directories but does not open/read files; a changed/new file is read and updates the same stable identity.
- Missing/partial entry attributes trigger conservative checks. Deletions update availability only after a complete successful scan.
- Settings show errors and unchanged file counts; failures retain the prior catalog.
- Meaningful incremental/schedule tests and existing suites/typecheck/lint/build pass.
# Decisions and open questions
SFTP has no portable recursive change feed. Directory listings remain necessary to discover changes, but unchanged songs need no per-file open/stat or metadata reads. Same-size edits with deliberately preserved timestamps require a future force-rescan action. Automatic scheduling operates while Muse runs, including background playback; it does not wake a sleeping/closed app. Use existing settings database, trusted profile and scanner.
