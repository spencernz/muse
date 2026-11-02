# Status
Implementing. Code, focused tests and release build complete; live provider success and visual signoff remain pending.
# Problem and outcome
Now Playing needs a Lyrics tab alongside its existing overline, replacing the details/actions while preserving artwork and playback controls.
# Scope
Native LRCLIB exact lookup using catalog metadata, bounded HTTPS requests and memory caching, plus locally imported LRC/text overrides. Timed line highlighting, click-to-seek, plain lyrics, instrumental/missing/error states. No AI generation, remote writes or bulk fetching. Embedded tag extraction and alternate-match search are deferred; imports provide a correction route.
# Acceptance criteria
Tabs support pointer/keyboard selection. Lyrics fetches only on opening the tab, stale responses cannot replace another track, playback remains available. Matching includes artist/title/duration to reject wrong versions. Synced lyrics follow playback and line clicks seek. Local imports persist, external results remain in bounded memory cache. Missing/network/instrumental states are distinct. Build and relevant checks pass; record unavailable visual inspection.
# Decisions and open questions
Use existing native HTTP, database and player. Online lookup shares only artist/title/album/duration; no audio/paths/credentials. Preserve Metro square geometry and dark English desktop conventions. LRCLIB has no required key; public redistribution/caching permissions remain separate from API access. No permanent cache of online lyrics.

# Follow-up: stable tabs
Remove the source/import footer at the user’s request. Keep both tab panels in a shared grid so the details and lyrics reserve equal space; playback controls and artwork do not shift when tabs switch. Imported overrides remain native foundation without an import action in Now Playing.

# Service diagnostic follow-up
API lookup is returning HTTP 502 outside Muse, including search, get-by-ID and get-cached. Expose a safe provider/status-specific error so outages are distinguishable from missing lyrics or invalid matching. No unverified mirror/fallback or credential change.
