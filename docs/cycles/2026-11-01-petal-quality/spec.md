# Status
Implementing.
# Problem and outcome
Fullscreen Petals appears nearly empty and flat. Diagnose actual texture/backing resolution, opacity, rotation and visible population before correcting the cinematic scene.
# Scope
Replace128px procedural petal silhouettes with inspected high-resolution transparent cherry-blossom raster artwork; preserve detail/alpha, improve midground visibility and restrained lighting, use natural less-extreme tumbling and area-aware visible population. Retain automatic measured-audio creation/wind/dissolve, three depth layers, no new controls, and add bounded native4K/DPR rendering shared with upcoming Chalk Pals.
# Acceptance criteria
- Actual rendering diagnosis is backed by code and failing regression evidence; do not claim a live analyser fault without measurement.
- Native4K texture-mode framebuffers reach3840×2160 under the supported pixel budget, with adaptive quality limits. Midground source textures at least512px, cached depth/erosion images bounded; missing sprites produce a diagnostic instead of a silently blank scene.
- Petals keep visible face area during tumble, adequate opacity/detail, natural scale at wide/fullscreen sizes, and a quiet baseline based on viewport area and visible particles rather than a fixed offscreen-inclusive count.
- Depth, subtle pink diffusion/airflow and ash lifecycle remain restrained; lower energy reduces density smoothly. Existing analyser is verified with changing actual PCM frequencies/amplitudes and frontend signal changes; distinguish synthetic verification from live-user playback.
- Meaningful regression tests, full checks/build/sign/relaunch; asset provenance and unresolved visual comparison noted. No reference image currently attached in the available thread; detailed written direction is the available target.
# Decisions and open questions
Chalk Pals remains an active separate cycle. Use imagegen built-in mode for the petal asset; no paid CLI/API key. The current sprite is a128px rasterized Canvas shape, not an external realistic texture. Root causes must be documented with actual call/size/opacity data. Actual native visual inspection may remain unavailable.
