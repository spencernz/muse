# Steps
- [x] Read workflow/UI rules and inspect shader, engine and ember rendering.
- [x] Reproduce discontinuous consecutive-frame movement with changing audio at long elapsed time.
- [x] Integrate flow instead of multiplying time by changing energy; stabilize texture coordinates and ember travel.
- [x] Fix colour selector native appearance/clipping and replace Auto with Shuffle effects plus no-repeat random selection.
- [x] Run targeted/full frontend checks, release bundle/sign/relaunch; attempt native UI inspection.
- [ ] Verify live flame motion and selector border/focus in the native window once inspection is available.
# Validation
Actual CanvasEffects arc coordinates across two frames at 180 seconds must remain continuous when mid energy changes slightly. Capture actual AtmosphericRenderer uniform values and assert bounded monotonic flow increments under energy changes and frozen pause/reduced motion. Full tests, typecheck, lint and bundle.
# Progress and decisions
Ranked hypotheses: absolute time multiplied by current audio speed jumps shader phase; bass-dependent coordinate scaling shifts the entire noise field; ember age repeats the same time-times-energy pattern. First isolate the actual ember movement seam. No CONTEXT/ADR files found in Muse. Physical UI service was unavailable in the previous cycle.
# Results
- Red loop: `npm test -- src/visualizer/fire-continuity.test.ts` initially failed: maximum consecutive-frame ember displacement 0.290623 normalized height, expected <0.01, with mids changing 0.20→0.22 at 180 seconds. This reproduces a concrete temporal discontinuity; the exact perceived appearance still needs live verification.
- Fix: persistent integrated ember ages and shader flow phase replace absolute-time-times-changing-speed. Flame noise coordinates no longer scale with bass-controlled envelope height. Pause/reduced motion freeze integrated travel.
- `npm test`: 112 passed. Tests exercise actual Canvas particle coordinates, actual AtmosphericRenderer uniform submissions with a mock GL context, bounded phase changes, pause/reduced motion, resource cleanup, and 30-second random no-repeat shuffle with saved preference compatibility.
- `npm run typecheck` and `npm run lint`: passed.
- Native computer-use inspection retry: no apps/browsers available; `Sky Computer Use native pipe startup failed`. Final flame motion and selector border/focus at desktop/narrow widths remain pending visual verification.
- Final `npm run bundle -- --bundles app`: passed, including the later selector/shuffle changes (18.80 MiB app). `codesign --verify --deep --strict` passed after signing with `local.muse.player`. Previous Muse process terminated and exact release bundle reopened. Native backend unchanged, so the previous native suite remains applicable (80 passed, 2 live cases ignored).
- No instrumentation, server changes, dependencies or commit.

New user steering: screenshot shows native rounded select border clipped by fixed panel overflow. Use explicit square select appearance, inset focus space and confine clipping to the canvas. Rename checkbox to Shuffle effects and make its selection random rather than sequential; retain stored `auto` flag for compatibility.
