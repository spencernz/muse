# Steps
- [x] Inspect catalog/availability, SSH decoder, mood generator, settings and local model/runtime support.
- [x] Verify pinned Essentia runtime/models locally; record integrity/licence/input/output contract.
- [x] Add versioned profile/override storage and source fingerprint/cache seams.
- [x] Add bounded local/SSH excerpt decoding and local worker protocol with cancel/error handling.
- [x] Add managed analyser installation, incremental pilot/background jobs and status commands.
- [x] Replace standard mood generation with local ranking of fresh profiles and explicit thresholds/diversity.
- [x] Add settings pilot/progress/review/correction UI and update mood copy/setup paths.
- [x] Replace Home mood generation with AI DJ queue playback targeting one hour, preserving saved AI playlists in sidebar.
- [x] Run native/frontend regression suites, real-model smoke fixture, lint/typecheck, release bundle/sign/relaunch; attempt UI inspection.
- [ ] Review the20-track personal-library pilot and native UI/real-server behavior when inspection is available.
# Validation
Synthetic audio/source fixtures test bounded sampling and cache/source-change rejection without contacting personal SSH. Fake worker/service seams test cancellation and failures. Local installed model smoke test uses generated audio, asserts numeric finite outputs/class mapping and no cloud/network inference; subjective musical accuracy requires the pilot review. Mood fixtures explicitly reject high-energy Chill candidates and unavailable/stale profiles, honor corrections and bound artist repetition. Frontend tests cover setup, status, errors and generation without OpenAI credentials. Do not run paid calls or modify personal audio/server.
# Progress and decisions
Essentia current macOS arm64 wheel is CPython3.14 (~94MiB). System Python3.14 exists here, but production will use a pinned relocatable standalone runtime (~26MiB archive) and pinned wheel pack in app data. Temporary isolated package proof is being installed before implementation. Main app remains small; local model pack installation is explicit. Source data/model identifiers and SHA256s may be recorded; no user credentials or library content in docs.
# Results
- `npm test`:130 passed, including analysis pilot/cancel/errors/corrections, saved playlists without OpenAI credentials, Home AI DJ queue/no-playlist behavior, visual regressions and automatic Petals controls.
- `npm run typecheck`, `npm run lint`:passed.
- Native regression suite:88 passed,3 ignored (public catalog/liveSSH/model-download cases); the model-download case was also run explicitly and passed. An initial sandbox run could not bind local HTTP fixtures; rerun outside sandbox passed. Synthetic SSH fixture access was corrected before the final pass.
- Real model smoke: `cargo test --manifest-path src-tauri/Cargo.toml real_managed_pack_install_and_local_inference -- --ignored` passed with actual pinned standalone runtime/wheels/models and generated PCM. Final installer variant passed in48.38s. It verifies installation, relocation and finite local inference; it does not establish subjective music-mood accuracy.
- Standalone worker smoke also produced finite model outputs from generated audio, without a cloud request or credentials. No personal music or server files used by tests.
- `npm run bundle -- --bundles app`:passed,19.02MiB. Ad-hoc signature `local.muse.player` applied; `codesign --verify --deep --strict` passed. Old process terminated and exact release bundle reopened. Model pack intentionally remains an explicit in-app installation. No reference to private credentials or audio in docs.
- Actual pilot on the user's music, real-server sampling and native UI verification remain pending. No paid API calls or server writes made. See `models.md` for the model/runtime contract and licences.

User steering: Home mood section should become AI DJ, building/starting a roughlyone-hour queue (~20 tracks) without saving it. Keep AI playlist action on left nav. Reuse local ranking profiles for both, with DJ duration selection bounded30 tracks and explicit shorter-session messaging.

Native UI inventory retried for the combined release: no apps/browsers; `Sky Computer Use native pipe startup failed`. Automated tests and synthetic real-model inference pass, but personal-library pilot review, real-server sampling and physical native UI checks are not claimed.
