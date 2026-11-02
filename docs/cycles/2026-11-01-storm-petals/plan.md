# Steps
- [x] Read workflow/UI rules, inspect current effect implementations and saved preferences.
- [x] Replace Nebula with Petals; migrate stored preferences and update controls/shuffle.
- [x] Implement depth-layered petal renderer with continuous integrated motion.
- [x] Rework Storm shader/clouds and Canvas rain/lightning with bounded flashes and cooldown.
- [x] Test geometry, pause/reduced motion, no teleporting, migration and transient-only lightning.
- [x] Run full frontend checks, bundle/sign/relaunch; attempt native visual inspection.
- [ ] Physically verify Storm/Petals appearance, motion, desktop/narrow layout and real playback once inspection is available.
# Validation
Canvas spies exercise actual petal paths and storm lightning/rain geometry. Controlled audio/time fixtures verify bounded particle motion, pause/reduced motion and transient cooldown. Preferences regression verifies legacy Nebula mapping. Existing controls tests verify mode switching and shuffle. Full frontend tests/typecheck/lint and Tauri release build. No backend changes planned; previous native 80-pass suite remains applicable.
# Progress and decisions
Petals will use Canvas 2D curved paths and depth layers; no GPU needed. Remove Nebula shader branch and update GPU mode mapping so Storm/Fire retain stable identities. Storm keeps shader cloud volume plus CPU rain and localized branching lightning; audio changes modulate integrated wind rather than multiply absolute time.
# Results
- `npm test`: 116 passed. Actual petal geometry tests verify folded paths, bounded consecutive-frame motion with energy changes, and frozen positions on pause/reduced motion. Storm tests verify no flashes without a transient, cooldown across repeated peaks, reduced-motion/pause flash suppression and bounded rain geometry/count. Legacy Nebula settings migrate to Petals and shuffle excludes the removed mode.
- `npm run typecheck` and `npm run lint`: passed.
- UI inventory retried: no apps/browsers; native service reports `Sky Computer Use native pipe startup failed`. Actual shader appearance, desktop/narrow rendering and perceived motion remain pending visual inspection. Automated Canvas tests do not establish visual quality or real GPU FPS.
- `npm run bundle -- --bundles app`: passed (18.80 MiB). Ad-hoc signed with identifier `local.muse.player`; strict codesign verification passed. Previous Muse process terminated and exact rebuilt bundle reopened. No native audio/SSH/credential changes, dependencies, paid requests or commits.
Cycle remains implementing until physical visual acceptance is verified.
