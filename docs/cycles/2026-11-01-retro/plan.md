# Steps
- [x] Inspect existing engine, analysis and published package versions/licenses.
- [x] Verify external audio API and select/persist curated presets and notices.
- [x] Implement lazy renderer, transitions, size/resource policy, migration and error paths.
- [x] Add regression coverage; run checks and rebuild with Petal/Chalk/notification changes.
# Validation
Inspect installed source for API behavior; test adapter with changing real PCM frames and renderer spies, preset timing, pause/resume, resize, disposal and unavailable GPU. Run existing frontend/native tests and build. Attempt desktop/4K/narrow native visual review; do not equate mocked tests with GPU validation.
# Progress and decisions
Official README requires WebGL2. Native existing pipeline provides actual PCM/FFT from the playing mixer. Registry latest versions are2.6.7 and2.4.7, MIT; confirm package licenses after installation. No browser audio source exists to connect.
# Results
Pending.


## Final implementation and checks
Implementation finished. `npm test`:135 frontend tests passed. After the final engine cleanup change, `npm test -- src/visualizer/render-quality.test.ts src/ui/visual-effects.test.tsx src/visualizer/retro.test.ts`:13 passed. `npm run typecheck`, `npm run lint`, `npm run build`:passed. `cargo test --offline --manifest-path src-tauri/Cargo.toml`:passed, with3 explicitly opt-in/live tests ignored. New native test changes100Hz/.15 amplitude to6kHz/.6 in the same tap, verifies sequence, frequency regions, RMS and1024 contiguous resampled PCM; pause/reset clear PCM. This verifies the pipeline with synthetic audio, not the user's live SSH stream.

CUA retried after session reset: no apps/browsers and `Sky Computer Use native pipe startup failed`. Actual embedded/fullscreen/narrow visual appearance, 4K GPU performance and live music verification remain pending; no visual signoff or measured60FPS claim. Source artwork inspected directly. Release bundle build started; signing/relaunch result recorded below when finished. No commit requested or made.

### Integration decisions
Verified installed2.6.7 source: `createVisualizer(null,canvas,opts)` accepts no AudioContext; `render({audioLevels:{timeByteArray,timeByteArrayL,timeByteArrayR},elapsedTime})` consumes1024 bytes, default44.1kHz. Native24kHz captured PCM is resampled to44.1kHz before transport; no smoothed waveform reconstruction, microphone, extra playback or output. Mono tap is sent identically to left/right (stereo imagery limitation). Six curated authored presets are precompiled into static TS via scripts/prepare-retro-presets.mjs so strict CSP stays intact (no unsafe-eval). Bundle splits198.37kB Butterchurn and18.92kB curated presets, lazy-loaded. MIT notices ship under public/licenses. Presets45s dwell/5s blend, pause progression when signal not live. Reduced motion uses explicitly labeled calm Spectrum. WebGL2 failure uses labeled Spectrum; own context released with WEBGL_lose_context on switch/unmount.4K presentation output, feedback textures capped1080p to bound multi-buffer GPU use. Storm implementation/shader branch removed; stored storm migratesretro. Existing global Shuffle effects remains unchanged.

`npm audit --json`:13 moderate findings in existing lint/Vite toolchain; none attributed to Butterchurn/presets/new runtime dependencies. No unrelated dependency upgrades applied. Official sources: https://github.com/jberg/butterchurn and installed package LICENSE/API implementation.

Final combined frontend suite after scrollbar integration: `npm test` —138 passed across25 files. Final frontend build emits separate lazy Retro chunks and packaged artwork; updated native release build underway.

## Release handoff
Final `npm run bundle -- --bundles app` succeeded (29.95MiB). Ad-hoc signing and `codesign --verify --deep --strict --verbose=2` passed. Replaced the existing release bundle at src-tauri/target/release/bundle/macos/Muse.app. Terminated old PID23901, opened that exact bundle, and verified new PID30425. Implementation and release delivery are finished; cycle remains implementing only because native visual/performance acceptance could not be observed with the unavailable CUA service. No changes to remote media, credentials or library data; no commit made.

## Follow-up: presentation resolution regression
Checked actual2.6.7 `renderToScreen`: default framebuffer viewport uses renderer width/height; it does not set the supplied canvas backing dimensions. Previous code configured internal textures but left output canvas at browser default300×150, cropping then CSS-stretching the rendered corner. Added assertion on the actual canvas passed to createVisualizer: failed300 vs3840 before fix. Now explicit canvas.width/height match physical output resolution, and Butterchurn width/height use those same physical dimensions with pixelRatio1 (avoids Retina viewport mismatch). Regression also checks subsequent resize updates both canvas and renderer dimensions. Presets and audio unchanged to isolate the verified cause.

## Final combined release
`npm test`:136 passed; `npm run typecheck`, `npm run lint`, `npm run bundle -- --bundles app`:passed. Bundle 50.03MiB. `codesign --verify --deep --strict --verbose=2`:passed. Replaced current app, old PID30425 terminated, new PID32528 verified. Native CUA again returned `Sky Computer Use native pipe startup failed`, so visual appearance remains unverified; implementation and delivery done. No commit made.

## Opening preset follow-up
- [x] Select a random starting preset per Retro instance, excluding the previous instance’s opening preset.
- [x] Add deterministic coverage of random selection/no immediate repeat and transition from the selected index.
- [x] Run relevant tests/typecheck/lint/build and replace the running app.

Opening follow-up: `npm test -- src/visualizer/retro.test.ts`:5 passed, including a red/green integration test for nonzero initial preset and a no-repeat selector test. `npm run typecheck`, `npm run lint`, `npm run bundle -- --bundles app`, ad-hoc codesign and strict verification passed. Relaunched release bundle; new PID33368. No commit. Native visual verification unavailable as previously noted.
