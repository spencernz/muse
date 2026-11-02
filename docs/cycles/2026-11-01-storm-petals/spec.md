# Status
Implementing.
# Problem and outcome
Replace the disliked Nebula visualizer with falling flower petals, and give Storm a more convincing atmospheric composition.
# Scope
Keep five modes: Spectrum, Wave, Petals, Storm, Fire. Petals use layered, gently tumbling curved shapes, depth, soft lighting and music-driven drift. Storm uses rolling cloud banks, rain depth, low mist and branching music-triggered lightning. Reuse the audio analyzer, themes, controls, performance limits and current layout. Existing deliberate artistic glow/gradient/motion exception to UI rules applies within visualizations only.
# Acceptance criteria
- Nebula is absent from the selector and rendering; saved Nebula settings map to Petals without losing theme/intensity/shuffle preferences.
- Petals fall continuously with audio affecting wind and flutter through integrated phases; no absolute-time-times-energy jumps. Depth is evident through size, opacity and tumble; all themes work.
- Storm has layered moving clouds and rain; branching lightning requires an audio transient with >=3.5s cooldown and subdued localized glow. Reduced motion disables lightning and freezes particle travel; pause freezes motion.
- Mode switches preserve the audio pipeline. Shuffle includes Petals and excludes Nebula.
- Meaningful rendering, motion, migration and lightning tests pass, plus frontend lint/typecheck/build and final signed release relaunch. Record native UI inspection limitations honestly.
# Decisions and open questions
Choose flower petals rather than confetti, with a calm drifting composition that becomes livelier with music. No additional dependencies, server changes, or audio changes. Native inspection has repeatedly been unavailable; attempt it again and keep visual acceptance pending if unavailable.
