# Steps
- [x] Reproduce orphan retention with a minimal native regression and inspect dialog placement.
- [x] Delete source-only catalog rows transactionally and repair saved playback/orphans.
- [x] Reconcile live queue, update confirmation copy and centre shared dialogs.
- [ ] Run relevant checks and build with AirPlay; record visual verification gaps.

# Validation
Run the exact failing native test before/after the fix; cover shared locations, remote identities, playlist/history/FTS, actual file retention and persisted playback. Frontend tests cover confirmation copy, cancel and removal/error flow. Inspect actual dialog positioning/keyboard behavior where automation is available. Run npm typecheck/lint/test, cargo fmt/test and release build. Preserve unrelated changes; no commit requested.

# Progress and decisions
Read workflow/UI rules and diagnosing-bugs skill. No repository CONTEXT.md or ADR was found in the standalone Muse tree. A tight native repro is the primary loop for removal. Dialog placement will be checked against actual rendering; the simple CSS issue does not warrant broad production instrumentation.

# Results
`cargo test --manifest-path src-tauri/Cargo.toml --test library removing_folder_removes --quiet` reproduced the bug (1 track remained instead of 0); it passed after transactional orphan cleanup. All 9 library tests passed, including shared/offline/remote locations, physical file retention, startup repair and queue preservation. Native shared Add-to-playlist modal was observed at the viewport corner before the fix; shared CSS now explicitly sets fixed positioning, inset 0 and automatic margins. Restored an accidental pending stylesheet overwrite from the last verified bundle; all 102 existing Metro rule groups compare identically using parsed CSS declarations, with only new output-picker rules added. No debug logging added. Combined native suite passed 51 tests; frontend checks passed before subsequent UI refinements. The rebuilt app was relaunched and the earlier source-less local catalog records disappeared while the remote library and current queue/position remained. Native AirPlay dialog now visibly centres in the 1180×800 CSS px viewport, confirming the shared dialog correction. Final build will also include newer toolbar/cloud/settings refinements.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.
