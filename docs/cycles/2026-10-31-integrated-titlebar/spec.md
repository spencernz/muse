# Status
Implementing.

# Problem and outcome
The native macOS title bar draws a separate strip above Muse. Extend the app canvas behind the native traffic lights so the shell, album backdrop and Now Playing backdrop reach the top of the window.

# Scope
Use Tauri macOS Overlay title-bar style with hidden native title; preserve decorations and native window controls. Provide a transparent drag region and safe space for traffic lights. Keep other platforms and browser preview layout unchanged. Retain ongoing blue/cover-accent changes.

# Acceptance criteria
- No separate native title strip or Muse window title separates content from the top edge on macOS.
- Sidebar/content and cover atmospheres extend behind native controls; controls do not overlap actionable content.
- Native traffic lights remain available, window dragging works, and Close Now Playing remains reachable and square.
- Typecheck, lint, affected frontend tests and desktop build pass; actual release app is relaunched and visually inspected.

# Decisions and open questions
Preserve native macOS decorations; use transparent overlay rather than a replacement set of traffic-light buttons. Add only the narrowly scoped permission required by Tauri's drag region. No commit requested.
