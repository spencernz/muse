# Status
Implementing.
# Problem and outcome
Extend immersive Now Playing with a third Visual Effects tab and five polished music-reactive effects driven by actual Muse audio, while preserving artwork and all playback/lyrics behavior.
# Scope
Native PCM analysis at existing 48 kHz stereo output mixer (local and SSH), compact FFT/waveform frames over IPC, shared frontend analyzer, Canvas spectrum/waves and procedural atmospheric rendering for Nebula/Storm/Fire, compact mode/intensity/theme controls, persisted preferences, optional automatic effect cycling. No browser audio element exists; do not create an AudioContext or duplicate playback. Audio callbacks must not perform FFT, allocate buffers, wait on analysis locks or call IPC.
# Acceptance criteria
- Tab order Now Playing/Lyrics/Visual Effects, keyboard navigation across three, stable panels with artwork left and unchanged transport/progress below.
- Five visually distinct effects respond to captured real PCM, not simulated amplitude. Shared frame source survives mode changes; pause/seek/track changes clear stale energy; unavailable/stale analysis has explicit idle diagnostic.
- Bass/mid/treble/RMS and adaptive spectral-flux transient detection with smoothing/cooldown drive effects. Storm has bounded low-brightness flashes, no lightning under reduced motion and no random lightning.
- Album Adaptive default reuses extracted cover colors; Aurora/Ember/Ice/Monochrome and intensity/effect persist with validated localStorage fallback. Controls remain compact/accessible at native 620px minimum and smaller browser viewports.
- RAF draws without React per-frame updates; typed arrays/resources reused, DPR/pixel/particle budgets capped, hidden/offscreen/paused views throttled or stopped, loops/listeners/GPU resources cleaned up. Automatic cycling is opt-in.
- Relevant native/frontend regression tests, full suites, lint/typecheck and release build pass. Record limitations of physical native visual inspection and live server/output tests honestly.
# Decisions and open questions
Native output tap is required because Rodio/CPAL owns decoding and playback, including remote buffered SSH PCM and AirPlay hardware output. Capture after sink volume; visual response reflects audible Muse samples and fades when muted. Analysis uses a fixed-size atomic ring and bounded lease, downsampled to 24 kHz; FFT on command worker, never device callback. Render on demand only in the visible Visual Effects panel. Existing Metro dark English/square design is retained; artistic gradients/glow/motion inside the visualization are intentional requested exceptions to parent UI rules. No new heavy dependencies. The optional separate fullscreen visualizer is omitted: existing native fullscreen continues to show the normal artwork and transport.
