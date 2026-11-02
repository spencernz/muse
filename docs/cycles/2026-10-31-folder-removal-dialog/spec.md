# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
Removing a watched local folder currently leaves its songs/albums visible as unavailable. The confirmation dialog appears off-centre. Remove folder-only catalog records and centre shared dialogs in the app viewport.

# Scope
Transactional local-source removal, playlist/history/search and saved queue cleanup, recovery of source-less local records left by earlier removals, accurate confirmation copy, and shared dialog positioning/focus. Preserve physical files and artwork, tracks with another local source (including temporarily unavailable drives), SSH catalogs and unrelated music. Keep the pending AirPlay implementation.

# Acceptance criteria
- Removing a source deletes its locations and tracks that have no other local or remote location, along with their search, playlist and history references. Derived empty albums/artists disappear.
- Shared/remote tracks remain. Physical music files are untouched. Earlier orphaned local catalog records are cleaned on launch.
- Current/queued deleted tracks are removed without disrupting an unrelated current track; persisted playback cannot restore deleted ghosts.
- Confirmation describes catalog removal clearly, supports cancel/error/retry, and shared dialogs are centred within the viewport with constrained scrolling and keyboard focus restoration.
- Native removal regressions and frontend confirmation tests pass; inspect the dialog when UI access is available and rebuild the app with AirPlay.

# Decisions and open questions
Preserve a track when another location record exists, even if a drive is offline. Remote catalog records are separate identities and are never removed as a side effect. Deleting a source is catalog-only; do not delete actual songs. Remove orphan references from playlists/history because the track itself is being removed. Repair existing source-less local records on startup rather than asking users to re-add and remove the folder. Retain square, dark English Metro controls.
