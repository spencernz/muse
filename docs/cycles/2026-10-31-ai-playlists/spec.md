# Status
Implementing. Feature, automated checks and final release build are complete. Visual acceptance remains pending because the native computer-use service cannot start.

# Problem and outcome
Create a mood playlist with a few shuffled suggestions (including Happy, Chill and Dance), using the existing OpenAI key and music library. Save up to 20 tracks and make the mix accessible below Now Playing in the left navigation.

# Scope
Finish the existing uncommitted AI playlist implementation found during repository inspection. Add home mood tiles matching the supplied screenshot, reuse the shared AI connection, native playlist storage, dialog and current audio player. No listening-history analysis, external track discovery or remote file changes. Only bounded song/artist/album/genre metadata is sent on explicit Generate. No automatic paid retries.

# Acceptance criteria
- Home and sidebar offer a clear AI playlist action; home shows four random mood suggestions and a way to reshuffle. Home tiles are compact, visually distinct, and use an icon/color per mood. Clicking a home tile generates that mix directly, without opening a second mood picker.
- Home generation has visible progress/error states and prevents duplicate requests. Sidebar generation remains explicit in its dialog.
- Native validation accepts only available library tracks, rejects invented IDs, repeated selections, empty and over-20 results, and saves atomically.
- Success opens the existing playlist page and adds its name below a divider under Now Playing; rename/delete and playback continue through existing controls. Playlists persist across restart.
- Missing credentials, empty library, busy, failed and successful states are accessible and actionable. Failed requests preserve the selected mood and create no partial playlist.
- Automated tests and checks pass, release app is rebuilt, and UI is inspected at desktop and minimum supported native width where possible.

# Decisions and open questions
Muse is React/TypeScript/Zustand with a Tauri/Rust backend, SQLite playlist tables, native Keychain credentials and a single Rodio player. Existing AI playlist files and tests were present at task start and will be retained, reviewed and completed. Follow Muse's established English dark Metro styling, square geometry and 620px native minimum rather than parent web/i18n/theme conventions. Use up to 400 random available candidates to bound request size; metadata-based mood judgments are suggestions. No key retrieval or paid calls for verification. All saved playlists use existing storage/navigation; no schema change is required.
