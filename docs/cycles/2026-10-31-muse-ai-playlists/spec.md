# AI mood playlists

## Status
Implementing — code and automated checks complete; real-window visual verification pending because desktop automation cannot start.

## Problem and outcome
Create a playable mood mix from the listener's Muse library and access saved playlists below Now Playing.

## Scope
Offer shuffled mood choices (including Happy, Chill and Dance), generate one playlist with at most 20 unique available library tracks through the existing native OpenAI connection, persist through existing playlist tables, and navigate to the result. No external song discovery or automatic playback.

## Acceptance criteria
- A clearly labelled AI playlist action opens a keyboard-accessible dialog with several shuffled mood choices and a refresh action.
- Generate uses the configured OpenAI model/key; loading prevents duplicate submissions and errors preserve the selection with retry/settings access.
- Native validation rejects unsupported moods, unknown IDs, duplicates, empty, incomplete, refused or oversized output without creating partial playlists.
- Generation only sends bounded track metadata, never audio, paths or credentials; result contains at most 20 tracks from available candidates.
- Success persists the complete ordered playlist atomically, refreshes the library, selects the playlist and does not start playback.
- Sidebar shows saved playlists after a separator below Now Playing with active selection and usable overflow.
- Relevant Rust and frontend tests, typecheck, lint and build pass; inspect the changed UI at desktop and narrow width when available.

## Decisions and open questions
Use existing library tracks rather than unplayable recommendations. Sample up to 400 available tracks per generation to bound request size; small libraries yield fewer than 20. Reuse Muse's existing dark theme, native dialog and English copy conventions; the monorepo web shell/i18n components do not apply to this standalone Tauri app. Preserve all unrelated working changes. No commit was requested for this new feature.
