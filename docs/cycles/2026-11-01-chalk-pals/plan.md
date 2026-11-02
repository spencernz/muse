# Steps
- [x] Read workflow/UI/imagegen skill and inspect shared effects/rendering lifecycle.
- [x] Generate/inspect/persist high-resolution transparent chalk artwork and provenance.
- [x] Implement cached chalk textures, paw stamps/erosion and pooled audio-reactive scene.
- [x] Add sixth mode, automatic tuning and4K quality/memory budget adaptation.
- [x] Test simulation/quality/lifecycle/control integration; run checks/build/sign/relaunch; attempt native UI inspection.
# Validation
Inspect original artwork dimensions/alpha and actual image visually before integration. Deterministic scene fixtures verify spring stability, particle limits, transient cooldown/reduced motion and resource disposal. Unit tests verify4K/Retina pixel caps and adaptive scaling. Existing effects/player/fullscreen tests remain applicable. Physical appearance/crispness/GPU60FPS must be inspected on an available native/browser surface; automated tests do not establish those.
# Progress and decisions
Use imagegen built-in mode for raster chalk artwork; no paid CLI API/key. Prefer one coherent sprite atlas if it preserves at least512px cells. Keep asset-loader errors explicit in the canvas diagnostic, never replace missing animal art with icons. Other modes can keep the conservative pixel budget while Chalk Pals gets a native4K-capable cap.
# Results
Pending.


## Final implementation and checks
Implementation finished. `npm test`:135 frontend tests passed. After the final engine cleanup change, `npm test -- src/visualizer/render-quality.test.ts src/ui/visual-effects.test.tsx src/visualizer/retro.test.ts`:13 passed. `npm run typecheck`, `npm run lint`, `npm run build`:passed. `cargo test --offline --manifest-path src-tauri/Cargo.toml`:passed, with3 explicitly opt-in/live tests ignored. New native test changes100Hz/.15 amplitude to6kHz/.6 in the same tap, verifies sequence, frequency regions, RMS and1024 contiguous resampled PCM; pause/reset clear PCM. This verifies the pipeline with synthetic audio, not the user's live SSH stream.

CUA retried after session reset: no apps/browsers and `Sky Computer Use native pipe startup failed`. Actual embedded/fullscreen/narrow visual appearance, 4K GPU performance and live music verification remain pending; no visual signoff or measured60FPS claim. Source artwork inspected directly. Release bundle build started; signing/relaunch result recorded below when finished. No commit requested or made.

### Implemented
Four separate1254px transparent animal sprites with cached512px rendering, chalk grain and pencil strokes. Automatic bounded spring response to significant transients, textured fading paw stamps, mask-origin dust on retirement. Pooled7 animals/100 paw marks/200 dust fragments;3..7 animals depending on composition/energy, no new tuning controls. Reduced motion suppresses springs/paw spawning. Tests simulate multiple lifetimes at4K and verify finite bounded springs/pools, dust/paws, reduced motion and resource cleanup. Artwork paths/prompts and built-in imagegen provenance:artwork.md.

Final combined frontend suite after scrollbar integration: `npm test` —138 passed across25 files. Final frontend build emits separate lazy Retro chunks and packaged artwork; updated native release build underway.

## Release handoff
Final `npm run bundle -- --bundles app` succeeded (29.95MiB). Ad-hoc signing and `codesign --verify --deep --strict --verbose=2` passed. Replaced the existing release bundle at src-tauri/target/release/bundle/macos/Muse.app. Terminated old PID23901, opened that exact bundle, and verified new PID30425. Implementation and release delivery are finished; cycle remains implementing only because native visual/performance acceptance could not be observed with the unavailable CUA service. No changes to remote media, credentials or library data; no commit made.

## Follow-up: Chalk Zoo
Rename displayed mode, retain stored `chalk` preference and existing visible cap. Generate and inspect eight additional single-animal transparent textures at minimum1024px source resolution; update the texture loader and rotating selection to cover all12. Verify artwork alpha/dimensions and mode tests, then rebuild/relaunch with the pending Retro and scrollbar fixes.

### Chalk Zoo follow-up result
Display name changed to Chalk Zoo while stored `chalk` mode stays compatible. Twelve separate1254×1254 transparent species sprites are present (dog/cat/rabbit/fox/lion/elephant/giraffe/panda/penguin/koala/monkey/owl), all visually inspected for uncropped heads. Scene pool raised to12; at1080p approximately6 visible, at4K up to12, with distinct grid slots and rotating species. `chalk.test.ts` proves all12 appear over lifetimes and pool/spring/dust bounds. `npm test`:136 passed across24 files; `npm run typecheck`, `npm run lint`:passed. Bundle building.

## Final combined release
`npm test`:136 passed; `npm run typecheck`, `npm run lint`, `npm run bundle -- --bundles app`:passed. Bundle 50.03MiB. `codesign --verify --deep --strict --verbose=2`:passed. Replaced current app, old PID30425 terminated, new PID32528 verified. Native CUA again returned `Sky Computer Use native pipe startup failed`, so visual appearance remains unverified; implementation and delivery done. No commit made.
