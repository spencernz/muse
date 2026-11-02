# Status
Implementing.
# Problem and outcome
Visual Effects needs two viewing actions: a wider layout without the album cover and a dedicated fullscreen visual-only presentation that can close back to Now Playing.
# Scope
Add compact Expand/Restore width and Fullscreen actions on the visual canvas. Wide mode hides artwork and uses the available Now Playing content width with generous outer gutters; tabs, progress and transport stay available. Fullscreen shows only the visual canvas and one visible Close action; Close/Escape returns to the previous Now Playing layout, width, selected effect and native window fullscreen state. Keep the same canvas, engine and audio subscription through mode changes.
# Acceptance criteria
- Expand hides the artwork only while Visual Effects is selected, retains outer margins and offers Restore width. Other tabs restore their usual artwork layout.
- Fullscreen uses the actual native fullscreen window and top-layer visual canvas; effect settings and regular Now Playing chrome are hidden. Close and Escape are keyboard reachable and return to the prior layout; focus returns to the Fullscreen action.
- If the app was already fullscreen, closing the visual does not exit the user's pre-existing fullscreen state. A close/unmount during native entry cannot leave a late fullscreen window behind.
- Controls remain square/minimal with accessible labels, hover and focus treatment. Canvas resize is handled without recreating the audio/graphics pipeline.
- Tests cover width restoration, fullscreen entry/exit, native entry races and prior fullscreen ownership, plus frontend/native checks and signed release build/relaunch. Record visual verification limitations.
# Decisions and open questions
Close returns to the same Now Playing Visual Effects tab and restores its previous width; it does not stop playback or reset the effect. Use a normally open modeless HTML dialog as the existing visual container, promoting the same node into the modal top layer for fullscreen so no canvas reparent/remount is needed. Native fullscreen uses the existing Tauri window architecture; document why a new enter command complements the existing exit command.
