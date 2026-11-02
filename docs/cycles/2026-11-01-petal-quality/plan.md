# Steps
- [x] Inspect actual petal texture generation/draw path, size/alpha/tumble and shared framebuffer limits.
- [x] Reproduce4K under-resolution through the real VisualizerEngine constructor/resize path; document checked causes.
- [x] Generate/inspect/persist high-resolution transparent petal artwork.
- [x] Replace loading/cache/erosion path, fix scaling/opacity/rotation and area/visible-population management.
- [x] Add shared4K/DPR/adaptive quality policy and changing-PCM/signal verification.
- [x] Run checks/build/sign/relaunch with Chalk Pals integration and attempt native inspection.
# Validation
Actual engine resize regression at3840×2160/DPR1 must fail before the fix. Texture loader/dimensions/alpha checked from the generated source, render spies capture opacity/scale/size, deterministic lifecycle tests cover quiet/wide/4K area and visible occupancy. Native PCM tap fixture changes bass100Hz to treble6kHz and amplitude in one stream, verifying new sequence/regions/RMS; frontend signals must follow frames. No claim of live server/audio verification without a surface.
# Progress and decisions
Checked current code: `PetalTextures` uses SIZE128 and basic cubic paths rasterized with gradients; engine caps all modes to650000pixels; Petals caps geometric scale at1.25 even at4K, x-tumble can shrink to0.24, middle alpha0.66/background0.24, and population14..50 ignores viewport area and counts offscreen/faded particles. Numeric/engine repro to follow before implementation. These are observed code properties, not inferred audio failures.
# Results
Pending.


## Final implementation and checks
Implementation finished. `npm test`:135 frontend tests passed. After the final engine cleanup change, `npm test -- src/visualizer/render-quality.test.ts src/ui/visual-effects.test.tsx src/visualizer/retro.test.ts`:13 passed. `npm run typecheck`, `npm run lint`, `npm run build`:passed. `cargo test --offline --manifest-path src-tauri/Cargo.toml`:passed, with3 explicitly opt-in/live tests ignored. New native test changes100Hz/.15 amplitude to6kHz/.6 in the same tap, verifies sequence, frequency regions, RMS and1024 contiguous resampled PCM; pause/reset clear PCM. This verifies the pipeline with synthetic audio, not the user's live SSH stream.

CUA retried after session reset: no apps/browsers and `Sky Computer Use native pipe startup failed`. Actual embedded/fullscreen/narrow visual appearance, 4K GPU performance and live music verification remain pending; no visual signoff or measured60FPS claim. Source artwork inspected directly. Release bundle build started; signing/relaunch result recorded below when finished. No commit requested or made.

### Confirmed causes and corrections
The actual4K engine resize test failed before correction:1075px backing width for3840CSSpx. Now passes3840×2160. Original128px cubic-shape raster textures replaced by real1254px transparent atlas (627px/cell),512px cached variants with original colour/alpha, veins and shading. Main alpha increased. X-tumble floor raised from.24 to.64; viewport-based size scale replaces1.25 cap. Quiet population uses viewport area (14..28) and visible occupancy, retaining50 cap; smoothed energy still drives gradual births/retirements. Three depth layers use cached downsampled soft focus; ash origins sample actual alpha silhouette. Pixel budget8.29M with adaptive quality and unused secondary canvas reduced to1×1. Cache bounded24 variants plus4 bases; released on switch/unmount. No evidence found that the existing FFT caused the poor appearance; numeric real-PCM test passes.

Final combined frontend suite after scrollbar integration: `npm test` —138 passed across25 files. Final frontend build emits separate lazy Retro chunks and packaged artwork; updated native release build underway.

## Release handoff
Final `npm run bundle -- --bundles app` succeeded (29.95MiB). Ad-hoc signing and `codesign --verify --deep --strict --verbose=2` passed. Replaced the existing release bundle at src-tauri/target/release/bundle/macos/Muse.app. Terminated old PID23901, opened that exact bundle, and verified new PID30425. Implementation and release delivery are finished; cycle remains implementing only because native visual/performance acceptance could not be observed with the unavailable CUA service. No changes to remote media, credentials or library data; no commit made.
