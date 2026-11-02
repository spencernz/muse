# Status
Complete implementation; verification limits recorded in plan.md.

# Problem and outcome
Listeners can close Muse’s interface while native audio keeps playing, restore the same window and explicitly quit completely.

# Scope
Persist a close preference, native tray actions, one-time background notification, existing media controls and state preservation. No autostart, second webview or new audio engine. Preserve Metro geometry (zero radius overrides generic repository rules).

# Acceptance criteria
- Settings offers “When closing the window”: “Keep running in background” / “Quit Muse”, persists across launches, reports save errors.
- Background close hides the existing window without pausing or resetting queue, position, volume, shuffle or repeat. Tray click / Show Muse restores and focuses it.
- Tray Play/Pause, Next and Previous operate the existing native engine while hidden; Quit and standard explicit OS quit always terminate and save playback.
- One-time native explanation after first successful hide, persisted across launches; notification denial/failure does not break playback.
- Existing system media controls remain connected where supported. Hidden playback and track advancement work independently of webview throttling.
- Settings remains accessible at narrow/desktop widths with square controls.
- Test supported lifecycle behavior on available macOS host; document unavailable Windows/Linux verification and platform tray limitations.

# Decisions and open questions
Default to Quit Muse to preserve existing behavior; background mode is opt-in. Rodio already owns decoding/output on a native thread, so hidden webview throttling needs no override. Keep existing database settings (no migration). If tray creation fails, refuse background preference and retain normal quitting. Linux tray click events are unsupported upstream; Show Muse menu restores the window. Native menus follow OS styling. No startup registration.
