# Steps
- [x] Rename navigation/page and remove the SSH/SFTP sidebar entry.
- [x] Group settings sections and expose SSH connection management.
- [ ] Update navigation tests/docs and build with pending UI changes.
- [ ] Inspect the final navigation and settings route.

# Validation
Frontend tests check sidebar contents, Settings → Manage SSH / SFTP navigation and retained player/provider state. Run npm typecheck/lint/test and final release build; inspect actual UI where possible. Native behavior is unchanged by this cycle.

# Progress and decisions
The SSH connection action already exists in settings; make that the single visible entry point. Reuse the internal sftp route and existing settings component.

# Results
Removed the SSH sidebar entry; the gear and page now read Settings, with Local music folders, Remote music and Background playback sections. Manage SSH / SFTP is the visible connection entry point. The settings gear stays active on the internal provider route. Updated the source-navigation regression and docs. Final test/build/visual results pending.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.
