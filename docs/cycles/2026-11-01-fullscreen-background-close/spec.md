# Status
Implementing. Code, automated checks, release replacement and relaunch complete; native visual/OS signoff remains pending.
# Problem and outcome
Closing a fullscreen Muse window to the background leaves a black macOS space rather than returning to the desktop. Preserve background music and exit the fullscreen space cleanly.
# Scope
Native macOS background-close lifecycle. Prevent close, request fullscreen exit, then hide after native transition completion. Restore cancels pending hide. Quit behavior stays explicit. Separate in-app Now Playing X navigates within Muse.
# Acceptance criteria
Never hide while the native window is still fullscreen. Hide after the resize event emitted by completed native fullscreen exit. Repeated closes do not queue toggles. Restoring during transition cancels hiding. Failed exit does not destroy/hide the window. Non-fullscreen background close and Quit behavior are preserved.
# Decisions and open questions
Asked user whether native red close or Now Playing X. Proceeding with the native close path, which currently hides fullscreen windows immediately. Installed tao 0.37.1 clears its fullscreen state in restore_state_from_fullscreen called from windowDidExitFullScreen, then emits resize/move events. No timers or AppKit dependency needed. Physical reproduction is blocked by computer-use service startup failure; report verification limit.

# Fullscreen chrome follow-up
User reports moving to screen top does not reveal native menu/window controls. Treat as native macOS fullscreen pending optional clarification. Use reserved native transparent title-bar mode in fullscreen, restore immersive Overlay on exit, and add an always-accessible Exit fullscreen control. Native menu-bar hover root cause remains unverified without OS inspection; do not claim the upstream historical issue proves this installation's cause.

# Aligned chrome and explicit menu reveal
The fallback Exit control and Now Playing X must share one 48px toolbar row at a single top/right origin, transparent at rest. The existing separate fixed/absolute positions caused different rows. During native macOS fullscreen explicitly request AutoHideMenuBar with AutoHideDock, mutually excluding HideMenuBar/HideDock, using AppKit on the main thread. Restore previous per-application presentation options on exit. Keep native title-bar handling. No system preference mutation. Add direct cached objc2/AppKit dependencies already present through Tauri; no extra library downloads. Native hover is unverified and remains an acceptance item, not a claimed reproduced root cause.
