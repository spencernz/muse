# Status
Implementing: feature, automated checks and desktop/live verification are complete; minimum-width visual sign-off remains pending because native resize automation could not control the active window.

# Problem and outcome
Select a remote music folder, sync its catalog, and play its tracks from the SSH server in Muse's existing player.

# Scope
Recursive, read-only SFTP metadata discovery; cached metadata/artwork; explicit Sync with progress/cancel; incremental rescans; remote source labels; streaming and seeking through the existing native Rodio sink. Preserve local files, playback, playlists and hidden Plex implementation. No audio downloads, offline library, server writes or shell commands.

# Acceptance criteria
- A saved remote folder can be synced recursively, with loading, empty, success, cancel and error feedback.
- Sync stores metadata/artwork only. Stable source-scoped IDs preserve favourites and playlists across rescans. Incomplete scans do not remove earlier entries.
- Remote tracks appear in the normal catalog with Remote labels and play through the existing queue, volume, pause, next and seek controls.
- Audio reads are bounded in memory and happen off the device callback. A dropped connection reports a recoverable playback error.
- Every independent connection verifies saved server trust before authentication; reads stay inside the selected root and do not follow symlinks. Disconnect or changed profile prevents new reads using old credentials.
- Tests cover catalog isolation, metadata, cancellation/failure, trust and read confinement, remote buffering/seek, and existing local functionality. Build the desktop bundle.

# Decisions and open questions
The user explicitly chose remote playback only. Sync means refresh catalog, never mirror audio to disk. Keep Muse's intentional dark, English, square Metro controls rather than applying the parent web app's component/i18n conventions. Native window minimum width is 620px; record desktop/narrow inspection limitations. Additive schema migration to version 2 retains local data; older releases must reject the newer catalog.
