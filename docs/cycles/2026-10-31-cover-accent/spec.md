# Status
Implementing.

# Problem and outcome
Replace Muse's default purple accent with the bright cyan-blue of the supplied Mail icon. Keep the application accent coordinated with the currently selected track's album cover across navigation and playback controls.

# Scope
Use #00a3ff as the reference blue. Apply a shared accent and contrasting foreground to navigation, branding, primary actions, active controls, focus, selections and player sliders. Derive this shared accent from the selected playback cover regardless of route or paused state. Preserve album-detail atmosphere based on the album being browsed and existing neutral shell surfaces. Keep square control geometry.

# Acceptance criteria
- No track, missing/broken cover, or grayscale/transparent artwork uses bright blue with readable contrast rather than purple or gray accents.
- Current colored artwork supplies one coordinated accent to the shell, mini-player and Now Playing. Changing track updates it; clearing playback restores blue. Pausing does not reset it.
- Default primary hover, active tabs/actions, settings selection and focus do not revert to hardcoded purple.
- Contrast remains at least 4.5:1 for accent text on dark surfaces and for text/icons on accent-filled buttons.
- Typecheck, lint, relevant tests and desktop release build pass. Relaunch release app and visually inspect the actual updated default accent and available cover-derived accents. Record unavailable visual checks.

# Decisions and open questions
Interpret changing color based on Now Playing as a shared application accent, including while browsing other pages. Reuse existing population-weighted cover extraction and race-safe caching. Grayscale covers use the requested blue fallback because there is no distinct hue. Preserve existing dark-only English Muse UI. No commit requested.
