# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
Choose an AirPlay speaker or another Mac audio output from Muse without losing the current queue, track position, playback state or volume.

# Scope
macOS AirPlay/audio-output control in the bottom player and immersive Now Playing. List Core Audio outputs exposed to the existing Rodio/CPAL backend, support selecting an output or following the Mac's system default, show current route, refresh and errors, and provide a direct Sound settings link for discovery/pairing. Keep local/SFTP inputs and the single player. No custom AirPlay protocol, remote receiver login, audio capture, second AVPlayer, or music upload. No global default-device changes from Muse.

# Acceptance criteria
- Output buttons open an accessible square Metro dialog with loading, empty/error, current output and refresh states. Escape closes and restores focus.
- macOS output devices are selected using native opaque IDs; stale/disconnected selections fail clearly rather than selecting a different device.
- Switching an active or paused track preserves queue, position, volume, shuffle/repeat and history. A failed switch leaves the prior player/output usable.
- System default follows macOS routing. AirPlay destinations not yet exposed as Core Audio outputs are connected using macOS Control Center/Sound; guidance states this limitation.
- Output failures pause playback with recovery guidance; users can return to system default. No silent fallback to another output.
- Native policy tests and frontend interaction tests pass; desktop bundle is rebuilt. Inspect actual UI where automation is available and record hardware/visual verification gaps.

# Decisions and open questions
macOS-first: native Apple AirPlay discovery is owned by macOS. AVRoutePickerView is tied to AVPlayer, while Muse uses native PCM via Rodio, so routing must use Core Audio outputs rather than replacing the player. Existing CPAL dependency is reused; no new dependency needed. Output choice is session-only, defaulting to System default on launch. Retain standalone dark English Metro presentation, square controls and the existing minimum 620px native window; shared parent web/i18n/light-mode rules are intentional exceptions. Physical AirPlay delivery requires a reachable receiver and may remain unverified in this environment.
