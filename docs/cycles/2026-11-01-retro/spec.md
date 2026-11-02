# Status
Implementing.
# Problem and outcome
Replace Storm with automatically evolving MilkDrop-style Retro visuals using Butterchurn, preserving the existing native player and fullscreen/expanded panel.
# Scope
Butterchurn 2.6.7 and presets 2.4.7 (registry latest, MIT); inspect published API before integrating. Curate distinct presets, transition every 45 seconds of playing with a 5-second blend. No added controls; hide Energy/Colour for Retro. Migrate stored storm preference to retro. Remove unused Storm rendering code after verification. Artistic gradients and motion are requested exceptions to UI rules.
# Acceptance criteria
- Retro replaces Storm in selection and saved preferences, works embedded/expanded/fullscreen.
- Real native PCM drives Butterchurn through its supported external audio data API; no second audio player/output or synthesized beats.
- Presets blend automatically, avoid immediate repeats, and pause progression when playback pauses or analysis is unavailable.
- WebGL2/loading failures produce a helpful diagnostic without interrupting playback; reduced-motion uses a calm alternative with a clear label.
- DPR-aware output supports4K with bounded textures and adaptive resolution; switching/unmounting releases GPU resources.
- Relevant tests, lint, typecheck, production build and bundle succeed. Record actual UI/GPU verification limits.
# Decisions and open questions
User's message ends at 'Use smooth'; assume5-second crossfades and45-second dwell. Native PCM is Rodio/CPAL, not an HTML audio element. Inspect Butterchurn's external time-domain input rather than making a duplicate Web Audio playback pipeline.

## Follow-up: blurry output
User screenshot shows muddy enlarged noise. Verify the actual presentation canvas dimensions, not only Butterchurn texture options; regression must assert the supplied canvas backing width/height before createVisualizer and after resize. Preserve presets/audio until this measurable fault is corrected.

## Follow-up: varied opening preset
Each new Retro session picks one of the six curated presets randomly. Do not repeat the immediately preceding opening preset. Continue the existing45-second dwell and5-second blend from the chosen start; keep pause/audio behavior unchanged.
