# Status
Implementing: code, tests and release build are finished. Final native UI inspection and a live billed OpenAI request remain pending; window capture is unavailable and no user key has been configured.

# Problem and outcome
Make repeated SSH catalog sync safe across overlapping selected roots, and provide a simple album-level AI action that identifies an album, finds real artwork/metadata and applies it locally without editing server files.

# Scope
Reusable native OpenAI connection settings with OS credential storage, configurable model and connection test/removal; one-click Search album info in album pages using existing album/artist/track-title context; catalog-backed match and cover preview, editable album details, explicit Apply; persistent local overrides linked to existing track IDs and retained through local/SFTP rescans. Strengthen remote canonical file identity across overlapping roots and add regression tests. No remote file writes, audio uploads, automatic AI background jobs, playlist generation or history analysis in this cycle. The shared AI connection is designed to support those later features.

# Acceptance criteria
- Repeated sync of the same SSH files (including an overlapping selected root on the same endpoint/account) reuses track identity and preserves favourites, playlist/history links and overrides; distinct files are not merged by title alone.
- OpenAI key is saved only in the system credential store, never returned to frontend, logged, placed in URLs or stored in SQLite. Settings show configuration/test/error states and permit removal.
- Album action requires no manual per-track matching. AI sees bounded album/artist/track-title context, never audio, SSH credentials, hostnames or full paths. Search presents a likely album and cover for review and application.
- Real catalog IDs and artwork are fetched from constrained documented services; AI never provides arbitrary download URLs. Requests have time/size/rate/redirect bounds and errors are redacted.
- Apply saves a local override and cached artwork, retaining stable file/track identities and respecting rescans. Files and playback are unchanged. Failure/cancel applies nothing; missing artwork can retain existing cover.
- Native/provider and frontend tests cover dedup, rescan retention, credentials, metadata parsing, bounded requests, failure/empty/mismatch/preview/apply flows. Build and inspect actual UI; record missing live API/hardware checks.

# Decisions and open questions
The user chose OpenAI API keys. Use existing keyring/reqwest conventions, Responses API structured output and a small model default consistent with the parent app (`gpt-4o-mini`), editable in Settings. AI identifies album-level context; MusicBrainz and Cover Art Archive supply verifiable records/artwork behind the simple review UI. One explicit user search initiates billed AI work; no audio/history upload. User mentioned future personalised playlists and history analysis: retain a shared AI module/credential setting, but implement album info first. Additive schema version 3 introduces canonical remote identities and local metadata overrides; v2 data is retained. Local and SSH copies are not merged merely because their tags match; full remote audio hashing/downloading is excluded.
