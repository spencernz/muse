# Status
Implementing.
# Problem and outcome
Replace flat Petals with a cinematic, automatically music-reactive cherry-blossom scene: delicate textured petals, depth, natural airflow, changing population and occasional ash dissolution.
# Scope
Procedurally generated/cached translucent sprites with asymmetry, blush/ivory/rose/peach shading, veins and curled highlights. Three depth layers, pooled lifecycle/fragment particles, smooth automatic energy/population/wind control, safe beat accents and sparse dust on a dark midnight-charcoal scene. Keep existing mode/fullscreen/width controls, but hide Energy/Colour tuning for this self-tuned effect; do not add new controls. Shared analyser/player unchanged. Ambient drift continues while paused/silent; reduced motion slows motion and suppresses beat bursts.
# Acceptance criteria
- Fixed natural palette and near-black scene, no purple/neon; mid petals ~18–30px at1080width, background8–18px, rare foreground35–45px; use blurred depth sprites.
- Quiet population10–20, moderate20–35, energetic40–50; smooth hysteretic target changes, gradual birth/retirement, measured transient bursts3–6 with cooldown and a hard50-petal cap.
- Integrated wind and particle inertia avoid phase jumps, jitter and per-petal audio bouncing. Birth fades, individual lifetimes and mostly offscreen exits preserve negative space.
- At most3 simultaneous dissolves; erosion frames and soft fragments originate from the petal's transformed silhouette and vanish gently. Pooled bounded resources and reusable cached textures; no per-frame React state updates.
- Paused/silent audio returns toward calm while drifting; reduced motion disables bursts and uses very slow movement. Resizing preserves normalized positions; hidden rendering still pauses.
- Tests cover population limits/energy adaptation, gradual calm/retirement, transient cooldown, lifecycle/pool bounds and resource disposal. Full frontend checks/build pass and app is rebuilt/relaunched. Actual visual acceptance remains pending if native inspection unavailable.
# Decisions and open questions
No reference image was attached to the request, so detailed written direction is the visual target. Procedural sprite textures fit the existing Canvas architecture and avoid an extra image dependency. Existing global effect switching, display actions and shuffle are retained; petal density/wind/colors/dissolve remain automatic. Local music-profile/AI DJ implementation continues as a separate active cycle, not cancelled by this addition.
