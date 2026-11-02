# Status
Implementing.
# Problem and outcome
Add Chalk Zoo, an automatically audio-reactive chalkboard animal visualizer with twelve distinct cartoon animal illustrations, paw trails, squash/stretch and chalk dust.
# Scope
New sixth effect; retain existing effects/player. Generate transparent high-resolution chalk animal artwork with the built-in image-generation tool, keep final assets in the repo, and cache textures/erosion stages at bounded resolution. Use existing real audio signals to drive smooth beat springs, natural movement, paw trails and dust. Fixed pastel chalk palette/dark charcoal background; no new tuning controls. Existing effect selection/fullscreen/width actions remain. Add DPR-aware native4K rendering with a capped framebuffer budget and adaptive performance fallback.
# Acceptance criteria
- Detailed animal artwork uses transparent512–1024px-per-head textures, not emoji/icons/geometric approximations. Grain, broken pastel strokes and soft colour variations remain visible.
- Significant measured transients trigger bounded spring squash/stretch with cooldown. Pooled textured paw trails fade naturally; retiring animals dissolve into bounded fine chalk dust originating on their texture silhouettes.
- Animal count/size scale with viewport composition instead of pixel count, keeping negative space at1080p/4K/narrow sizes. No new parameter controls.
- 3840×2160 can render natively on capable devices; DPR is respected with an explicit maximum pixel/memory budget and gradual adaptive fallback. Reuse arrays/textures, hidden rendering stops, reduced motion suppresses squash/bursts, and resources clean up.
- Tests cover budget calculations at4K/Retina/narrow sizes, finite bounded simulation/springs/trails/dust, persistence/shuffle integration and cleanup. Full frontend checks and release build/sign/relaunch pass; record unavailable actual GPU/native visual checks.
# Decisions and open questions
Chalk Zoo is the displayed name of the existing `chalk` mode, preserving saved preferences. Use twelve friendly heads: dog, cat, rabbit, fox, lion, elephant, giraffe, panda, penguin, koala, monkey and owl. Keep a balanced number visible at once; increase character variety, not crowding. Match the existing pastel-chalk style. Artistic textures/glow/motion inside this visualization are explicitly requested exceptions to parent UI rules. No reference image supplied. Generated artwork must be copied into public/visualizers/chalk-pals; final prompt/tool provenance saved in the cycle. Native UI service has been unavailable; retry it and leave visual acceptance pending if still unavailable.
