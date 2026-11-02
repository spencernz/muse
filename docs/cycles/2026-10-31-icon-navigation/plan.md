# Steps
- [x] Change the shared Back/X rest and hover styles.
- [ ] Build with pending UI refinements and inspect native rendering.

# Validation
Reuse existing Back/close/Escape/focus regression tests. Run npm checks and bundle; inspect rest/hover if UI automation allows. Keep keyboard focus outlines independently of hover.

# Progress and decisions
Both controls already share one selector in unified-layout.css; preserve their dimensions and square geometry.

# Results
Both controls now retain a transparent 1px border and transparent background at rest; hover reveals a square border/background. Dimensions remain 48px and keyboard focus styles are unchanged. Build/visual verification pending.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.

# Home follow-up
- [x] Hide Home's back control while retaining it on other pages.
- [x] Run navigation checks and include in next mini-player release.

Home back control is absent; existing navigation test updated to assert absence on Home and retain back routing elsewhere.

## Final follow-up build
- `npm run typecheck`, `npm run lint`, `npm test`: passed, 99 frontend tests across 13 files.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib desktop --quiet`: 3 passed (lifecycle, placement, preferences).
- `npm run bundle -- --bundles app`: passed, Muse.app 18.75 MiB. Local ad-hoc bundle signature applied and `codesign --verify --deep --strict` passed.
- Replaced the existing release bundle and relaunched it using the user's existing authorization; confirmed a new Muse process at the exact release path.
- Native visual inspection remains blocked by pipe startup failure. In particular menu-bar top-edge reveal and physical icon anchoring are not visually verified. Explicit fullscreen Exit action is covered by tests; user OS hover behavior remains an open verification item.
- Dock now always restores full Muse. Only tray/menu-bar click opens the compact window.
