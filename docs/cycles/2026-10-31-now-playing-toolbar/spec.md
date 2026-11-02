# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
Combine Now Playing's separate volume/queue and playback rows into one toolbar matching the supplied screenshots and requested placement.

# Scope
Now Playing only: volume trigger at the far left; shuffle, previous, play/pause, next and repeat in the centre; AirPlay then queue at the far right. Clicking volume opens an anchored square pop-up with mute on its left and slider beside it. Keep the mini-player volume layout, shared queue and audio engine. Preserve in-progress AirPlay and folder-removal changes.

# Acceptance criteria
- One Now Playing toolbar has the exact requested control order and an initially hidden slider.
- Volume pop-up supports click toggle, mute, slider, keyboard focus, Escape dismissal and outside-click dismissal; focus changes during slider/mute interactions must not dismiss it; closing returns focus appropriately and does not close Now Playing.
- Existing playback/queue/AirPlay actions remain functional. No second player or redesigned mini-player.
- Metro geometry and current artwork accent are retained, with responsive sizing. Frontend tests and build pass; record desktop/narrow inspection and remaining gaps.

# Decisions and open questions
The screenshots refer to immersive Now Playing. The compact bottom playback bar retains its existing volume control. The volume pop-up opens above its trigger and is nonmodal. Keep dark English square Metro styling rather than parent web component/theme/i18n conventions.
