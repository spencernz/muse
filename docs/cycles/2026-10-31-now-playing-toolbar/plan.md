# Steps
- [x] Add an accessible volume pop-up reusing the existing volume control.
- [x] Assemble one shared Now Playing toolbar with requested left/centre/right controls.
- [x] Adjust responsive Metro styling and tests.
- [ ] Build/relaunch and inspect the final toolbar plus pending AirPlay/dialog changes.

# Validation
Frontend tests exercise control order, slider visibility, mute/volume calls, Escape/outside dismissal, focus restoration, queue and AirPlay access; rerun existing player tests. Run npm typecheck/lint/test and release bundle. Native code remains covered by the combined 51-test suite from the pending AirPlay/folder-removal cycles. Inspect actual desktop rendering and narrow when available.

# Progress and decisions
Inspected existing Transport, VolumeControl, Now Playing layout and Escape handler. Reuse one toolbar in both populated and empty Now Playing states. Preserve the existing fixed-frame output-routing mixer and native player.

# Results
Implemented volume at left, centred transport, AirPlay/queue at right. Pop-up focuses the range, closes on Escape/outside pointer interaction, and retains last audible volume for unmute. Pending volume changes flush on close, avoiding lost final slider values. Updated tests for intentionally hidden volume sliders in populated and empty Now Playing states. Final test/build/visual results pending.

## Volume interaction regression
The user reports that clicking/dragging the volume range dismisses it. The focus-out handler is suspected of treating WebKit range focus changes as outside interaction. Add a regression that moves focus outside without a pointer click while adjusting volume, then keeps the panel open until an actual outside pointer event. Remove focus-driven dismissal and use composed pointer paths for light dismissal.

Regression loop: `npm test -- --reporter=dot -t 'keeps the volume popup interactive'` failed before the fix because a range blur unmounted the popup. Removed focus-driven dismissal and changed outside detection to the composed pointer path. Slider/mute/focus changes now keep the panel open. No broad instrumentation was needed because the minimized event regression directly isolated the handler.

## Final combined build and handoff
- `npm run typecheck`, `npm run lint`, `npm test -- --reporter=dot --silent`: passed; **79 frontend tests** pass after the album-info addition and volume-focus regression fix.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: passed; **59 native tests**, 2 opt-in tests ignored by default. The public MusicBrainz/artwork test also passed when run explicitly.
- `npm run bundle -- --bundles app`: final **Muse.app built (18.55 MiB)** with all UI, folder-removal, AirPlay, duplicate-protection and AI album-info changes. Existing React virtualizer and Rust `block` warnings remain.
- Prior desktop checks verified centred shared dialogs, native output enumeration, source cleanup, Settings navigation and cloud-source semantics. Final physical slider/hover checks, minimum-width sign-off and latest AI UI inspection remain pending: native automation returned `cgWindowNotFound` for Muse and Finder. The release bundle is ready; quit/reopen it to load the latest code. Physical AirPlay receiver delivery and a billed OpenAI request have not been verified. No key was read from parent .env files or requested in chat.
- No commits created. The parent repository has pre-existing unrelated changes and Muse is untracked there.

See the [AI album-info cycle](../2026-10-31-ai-album-info/plan.md) and [AI setup](../../ai.md) for the latest combined handoff.
