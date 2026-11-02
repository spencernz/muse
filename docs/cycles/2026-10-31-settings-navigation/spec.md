# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
The sidebar exposes SSH/SFTP as a main destination while general preferences are labelled Music folders. Consolidate connection management into Settings.

# Scope
Remove SSH/SFTP from the main sidebar; retain its internal screen and reach it from Settings. Rename the gear navigation and page to Settings. Group local music folders, remote music/SSH and playback preferences on the existing page. Keep all provider state, Plex hidden, and current player/toolbar/cloud work.

# Acceptance criteria
Sidebar gear reads Settings and SSH/SFTP is absent from primary navigation. Settings identifies local folders and remote music clearly, with an accessible Manage SSH / SFTP action. Existing settings/source actions, back navigation and stored configuration keep working. Tests/build pass and record UI inspection.

# Decisions and open questions
Use Settings as the general destination; keep the existing gear icon and square Metro controls. The SSH/SFTP route remains internal and is not renamed in persisted provider data.
