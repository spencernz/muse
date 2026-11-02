# Status
Implementing. Code, automated checks, release replacement and relaunch complete; native visual/OS signoff remains pending.
# Problem and outcome
When Muse is hidden but playing, clicking its Dock/taskbar or tray/menu-bar icon should offer a compact current-track controller.
# Scope
Small native companion webview, same native audio engine/state. Artwork/title/artist, previous, toggle, next, favourite, Open Muse and dismiss. Dock reopen on macOS restores the main window. Tray click opens the mini player when main is hidden/minimized; visible main retains normal activation. Popup hides on blur/Escape/X; full app restores from Open Muse/tray menu. No second player or audio sink.
# Acceptance criteria
Companion is frameless, compact, placed within monitor work area and absent from taskbar. Native playback events/bootstrap update track/play status and favourite state; buttons invoke existing commands. Closing it leaves audio running. Main restore cancels pending fullscreen hide. Mini window permissions limited to core/window dragging. Missing track/error states remain actionable.
# Decisions and open questions
Use existing React store/bootstrap and native player events in a second webview. Mac Dock Reopen can be intercepted; Windows hidden-to-tray uses tray icon because hidden windows are not taskbar entries. Popup is anchored below the tray/menu-bar click rectangle, clamped inside its monitor; bottom taskbars use above-icon placement. Native inspection service currently unavailable, so physical OS interaction requires later verification.

# Follow-up: icon anchor and artwork blur
Use tray/menu-bar click rectangle to place the popup centered directly below the clicked icon, on its own monitor. Clamp to usable screen bounds and place above if a bottom taskbar leaves no room below. Dock activation restores the full main window and never opens the mini player. Render the active artwork as a clipped, blurred backdrop with a dark readability overlay and derived background color; update on track changes and fall back to Graphite if art is missing/broken. No desktop-transparency dependency.

# Dock behavior correction
User clarified: Dock clicks must restore the full main window. Only tray/menu-bar clicks open the compact player. This supersedes the original Dock activation scope and fallback plan.
