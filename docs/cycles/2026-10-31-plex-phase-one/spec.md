# Status
Implementing: code, automated verification and desktop inspection complete; live Plex/account and remaining platform/visual checks pending.

# Problem and outcome
Add Plex Media Server as an independent music provider in the standalone Muse desktop app. Users can sign in, discover servers/music libraries, select a library, test/reconnect and disconnect without changing local browsing or playback.

# Scope
React 19/TypeScript/Zustand frontend; Tauri 2 commands backed by Rust, SQLite non-secret settings, OS keyring credentials and bounded HTTP requests. Provider interface with local and Plex adapters; namespace Plex identities and return normalized artist/album/track models with opaque artwork references. Phase 1 UI supports setup and metadata verification only. No streaming, second player, imported Plex rows, Plex playlist editing or full catalog browsing.

# Acceptance criteria
- Existing local library, folder settings, playback queue/audio controls and shortcuts continue unchanged; Plex metadata never enters the local catalog or player.
- Plex source is selectable in existing navigation; settings include account PIN authentication in the system browser, discovery, explicit server and music-library selection, status, connection test, reconnect, cancellation/retry and disconnect.
- Manual server origin and token configuration supports development; local HTTP requires explicit opt-in, while remote endpoints require HTTPS.
- Account/server tokens remain Rust-owned except a transient password input for manual setup. Persist tokens only in the OS credential store; never return/log tokens, use them in URLs, store them in SQLite/localStorage or silently fall back to plaintext storage.
- Non-secret installation ID and selected server/library survive restart. Reconnect uses saved credentials, validates machine identity and music-library access; authorization failures prompt reauthentication, transient failures remain retryable.
- Validate origins (scheme, host, port, no userinfo/path/query/fragment), resolve and pin acceptable destination IPs, reject unsafe/link-local/metadata destinations, disable redirects/proxies, bound request time/response size, and redact transport/parse errors. Only internally constructed documented endpoints can be requested.
- Retrieve paginated artist/album/track metadata for a small selected-library verification sample, normalize durations from milliseconds and stable namespaced identifiers, and keep artwork references credential-free and origin-bound. Missing fields and errors are handled explicitly.
- Rust tests cover auth lifecycle, metadata, networking/policy failures, secret handling and provider isolation; frontend tests cover setup/discovery/error/disconnect and local player isolation.
- Typecheck, lint, affected tests and release build pass; record actual UI inspection and any unavailable real Plex account/server verification.

# Decisions and open questions
Use Plex's documented strong PIN polling flow and header token auth. Request only music libraries (artist sections). Persist one Plex server/library connection at a time; account discovery can list multiple servers. Secure HTTPS is preferred; local HTTP is development-only and user-approved. Keep existing dark English standalone Metro UI and square buttons. The monorepo Python backend is not part of Muse and is untouched. Manual credentials use a password field cleared after use; all account auth occurs outside Muse. If the OS credential store is locked/unavailable, show an actionable error and do not persist plaintext. No commit requested.

# Sources
- https://forums.plex.tv/t/authenticating-with-plex/609370
- https://developer.plex.tv/pms/ (headers, music types 8/9/10, sections and pagination)
- https://docs.rs/keyring/3.6.3/keyring/ (explicit platform store features)
