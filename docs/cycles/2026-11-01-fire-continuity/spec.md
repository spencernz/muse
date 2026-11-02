# Status
Implementing.
# Problem and outcome
The Fire visualization appears glitchy during playback. Preserve its look, themes and audio response while removing discontinuities in flame flow and ember movement.
# Scope
Fix temporal continuity in the existing shader/particle path. Also fix the clipped native colour selector and rename Auto to Shuffle effects, with actual random mode selection without immediate repetition. No playback or navigation redesign. Existing deliberate artistic glow/gradient exception remains applicable.
# Acceptance criteria
- Small audio energy changes cannot move embers or flame noise abruptly, including after several minutes.
- Flame flow accumulates bounded forward increments; pause/reduced motion freeze travel.
- Bass affects the flame envelope without resampling the whole noise field.
- Regression tests cover long-running audio changes, pause and reduced motion; frontend checks and release bundle pass.
- Colour selector uses square, fully visible borders and focus outline; shuffle has a clear accessible label and chooses a different random effect every 30 seconds. Existing saved auto preference remains compatible.
- Record actual visual verification limitations and rebuild/relaunch the app.
# Decisions and open questions
Screenshot confirms Fire renders. Still images cannot establish temporal behavior. Use deterministic consecutive-frame particle positions and shader-uniform captures to reproduce time/energy discontinuities; live visual confirmation remains necessary to assess the final artistic result.
