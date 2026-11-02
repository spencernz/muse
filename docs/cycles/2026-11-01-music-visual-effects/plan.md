# Steps
- [x] Inspect React/Zustand tabs, album color extraction, Rodio/CPAL graph and SSH buffering.
- [x] Add nonblocking PCM tap and shared native FFT/waveform analysis with stale/reset handling.
- [x] Add shared frontend signal analyzer, preferences and native signal lifecycle.
- [x] Implement five rendering modes, adaptive quality, themes, intensity, and auto-cycle.
- [x] Integrate third tab and responsive/stable layout.
- [x] Run meaningful native signal/audio-isolation and frontend lifecycle/controls tests; full checks/build.
- [ ] Inspect desktop/narrow native UI, actual WebGL rendering and real playback performance when a computer-use surface is available.
# Validation
Synthetic sine/silence/impulse cases through actual output reader verify audio-pass-through and captured spectrum, frequency regions and reset. Frontend tests verify smoothing/transient cooldown, settings validation, effect switching, pause/track changes, lifecycle cleanup and three-tab navigation. Full frontend/native suites, lint, typecheck and release bundle. Native computer-use previously unavailable; retry and record any remaining visual/live-playback verification gap. Do not call random ambient motion live audio analysis.
# Progress and decisions
Inspected output.rs OutputReader: only active hardware generation drains canonical 48kHz stereo mixer under existing try_lock. Place analysis write alongside that read; no tap on SSH worker/read-ahead buffer. No browser audio context/CORS/autoplay path needed. All render modes share a single frontend analyzer consumer and native buffer. Rendering noise/particles may be procedural, but all music energy and lightning triggers come from PCM-derived measurements.
# Results
- `npm test`: 108 passed, including smoothing/transient reset, preferences, shared lease/stop, control/resource isolation, visibility cleanup, three-tab order, all Canvas fallbacks and reduced-motion lightning suppression.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 80 passed, 2 ignored live-network tests. Synthetic 100/1000/6000Hz PCM maps to expected regions; actual OutputReader samples remain bit-identical and inactive routes do not drain/capture.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed. An earlier test-only TypeScript option error was corrected before these final checks.
- Native UI inventory: unavailable (`Sky Computer Use native pipe startup failed`, no browsers/apps). Desktop/narrow visual appearance, keyboard operation in the native window, real server playback and measured GPU FPS remain unverified. Offscreen OpenGL shader compilation was also unavailable because no offscreen GPU context could be created; Canvas automated checks do not establish shader visual correctness.
- `npm run bundle -- --bundles app`: passed (18.80 MiB app). Ad-hoc signature replaced with identifier `local.muse.player`; `codesign --verify --deep --strict` passed. Exact release bundle launched successfully with `open`.
- Optional dedicated fullscreen effect overlay omitted; existing native fullscreen remains usable and transport is preserved.
Implementation is in place; cycle remains implementing pending physical visual/live-playback acceptance checks. No dependency added, second player created, paid API request made, or server changed.

Release process verification: previous Muse process terminated, exact rebuilt bundle reopened; process 13136 runs `src-tauri/target/release/bundle/macos/Muse.app/Contents/MacOS/muse`. No commit made.
