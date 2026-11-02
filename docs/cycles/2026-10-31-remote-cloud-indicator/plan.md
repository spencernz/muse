# Steps
- [x] Add optional remote-cover cloud indicator and remove text tags.
- [x] Update source-indicator regression tests.
- [ ] Build with the merged toolbar and inspect the final UI.

# Validation
Frontend tests assert remote/local cover indicators and absence of Remote · SSH text. Rerun player tests, npm typecheck/lint/test and combined release build. Record actual visual checks and gaps.

# Progress and decisions
Reusing the shared Cover component for a small upper-corner icon and tooltip. Track rows retain no source label; source configuration remains available in SSH / SFTP.

# Results
Replaced text badges with small upper-corner cloud icons in shared covers (album cards, album details, home tiles, mini-player and Now Playing), with accessible names and tooltips. Track rows no longer display source text. Documentation and source-label tests updated. Final build/visual verification pending.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.
