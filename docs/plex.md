# Plex in Muse: Phase 1

Muse can connect an additional Plex music source while the existing local catalog and native player keep working. This phase implements authentication, server/music-library discovery, connection management and a small normalized metadata check. Plex catalog browsing, artwork rendering and audio streaming are not enabled.

## Connect an account

1. Open **Plex** in the sidebar, or **Music folders → Music providers → Manage Plex connection**.
2. Choose **Sign in with Plex**. Complete the Plex authorization in your system browser and return to Muse. Muse polls the time-limited PIN; use **Open Plex sign-in**, **Check sign-in** or **Cancel sign-in** if needed.
3. Choose a discovered server and **Connect server**. Only authenticated account resources advertising a server are considered. Secure HTTPS connections are attempted first (up to four endpoints per selection).
4. Choose a music library and **Use music library**. Video libraries are excluded.
5. Choose **Test connection**, then **Verify library metadata**. The latter checks up to three artists, albums and tracks, showing the library totals returned by Plex. It does not import tracks or alter the local queue.

An empty server list can mean that the account has no owned/shared reachable servers. A connected server with no music libraries needs a music library added/shared in Plex. Muse does not create libraries or change server settings.

## Manual development connection

Enter a **server origin** (for example `https://plex.example.com:32400`) and a Plex token in the password field, then **Connect manually**. Muse sends the token to that origin only. Enter no path, embedded credentials, query or fragment. The token field is cleared after every attempt; the server URL is retained on errors.

A local origin such as `http://127.0.0.1:32400` requires **Allow HTTP for a local development server**. That opt-in also applies when selecting a discovered local HTTP connection. HTTP transmits credentials without encryption; remote public endpoints require HTTPS. Invalid or self-signed TLS certificates are not bypassed. Loopback, RFC1918 and IPv6 ULA destinations are supported for local development; link-local, known metadata destinations, multicast, unspecified, mapped IPv6 and CGNAT ranges are rejected. Tailnet/CGNAT servers need an allowed HTTPS address outside those ranges in this phase.

Use **Reconnect** after a restart or network change. Saved connections load as configured until checked. Muse first tests the saved server directly, so manual connections and a reachable saved server can work without contacting plex.tv. Account connections can rediscover endpoints and obtain an updated server token if the saved route fails. **Discover servers** explicitly refreshes account resources. An authorization error requires signing in again or replacing the manual token. An unavailable library can be replaced after refreshing the connection.

**Disconnect Plex** deletes this app's Plex credential entry, clears its connection choice, cancels pending sign-in and removes in-memory discovery results. It does not delete music, touch local playback or revoke Plex's authorized-device record. Revoke Muse in Plex's account settings if account-side revocation is also wanted.

## Credentials and network policy

- Rust owns account and per-server tokens. Account tokens are used only at `https://plex.tv`; the server-specific resource token is used for the selected server. Tokens are request headers marked sensitive, never query parameters, returned DTO fields, browser URLs, frontend logs or SQLite/localStorage values.
- Manual input crosses Tauri IPC once and is cleared from the password field. No raw network/parse errors or response bodies are rendered. The OS credential store stores the account/server credentials in one entry scoped to the app identifier: macOS Keychain, Windows Credential Manager or Linux Secret Service. A locked/unavailable store returns an error with no plaintext fallback. Linux requires an available Secret Service/DBus session.
- SQLite stores only a stable installation identifier and the chosen server origin/identity, library, account/manual mode and local-HTTP preference under `providers.*` keys. No local music-table migration is needed.
- Native requests disable redirects, ambient proxies and certificate bypasses. DNS answers are validated and pinned to the connection (including the requested port) to prevent a second resolution/rebinding. DNS lookup and connect timeouts are four seconds; each HTTP request has a twelve-second timeout and a four-MiB body limit. Failed server selection tries at most four validated discovery endpoints. Connections are deliberately read-only.
- The frontend has no general remote-fetch/native-URL proxy command. Endpoints are constructed inside Rust from fixed documented routes and validated numeric library/metadata identifiers. Plex artwork is an opaque `{provider, serverId, key}` reference. It is not passed to the local asset loader.

## Provider design and later playback

`src-tauri/src/providers/` contains a read-only `MusicProvider` interface with local and Plex adapters. Both return provider-tagged metadata pages using Muse's existing Track/Album/Facet shapes; remote IDs are namespaced by Plex server and metadata key. Durations convert milliseconds to seconds, missing optional fields have stable fallbacks, and remote artwork remains a separate reference. The local adapter delegates to `Db`. Existing local commands and `Audio` have not been redirected through the new adapter. Provider initialization is lazy: opening Muse does not access the Plex credential store or network, and initialization failures are returned to Plex commands without blocking local startup.

Before enabling playback, add an explicit provider media resolver to the existing player. Resolve `{provider, serverId, metadataId}` rather than treating remote IDs or artwork keys as paths. Retain the single native audio engine and queue owner. Probe container/codec and seek behavior before selecting direct play or an explicitly supported conversion. If a browser/WebView audio transport is later used, negotiate browser-compatible MIME/codecs and serve authenticated bytes through a narrowly scoped native/custom-protocol or loopback bridge. Keep Plex tokens native, preserve HTTP Range/If-Range and 206/416/Content-Range semantics, stream without whole-file buffering, support cancellation and seeking, and bind URLs/handles to the selected connection. Do not send a token-bearing Plex URL to an `<audio>` element or create another player instance. No streaming endpoint exists in Phase 1.

## Development checks

From Muse:

```sh
npm run typecheck
npm run lint
npm test -- --reporter=dot
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --offline
npm run bundle
```

The native provider tests inject a credential vault and transport; loopback fixtures exercise real HTTP token headers, redirects, authentication errors and body limits. They use synthetic tokens and temporary databases, not your account/keychain. Network sandboxing may need to permit local test sockets. Frontend tests cover sign-in/polling/cancellation, manual input clearing, retry/reconnect/disconnect and local-player isolation. An actual account/server connection remains a separate user-specific verification step.

## API references

- [Plex's native PIN sign-in flow](https://forums.plex.tv/t/authenticating-with-plex/609370)
- [Plex Media Server API](https://developer.plex.tv/pms/): header auth, identity, sections, music types and pagination
- [Keyring platform stores](https://docs.rs/keyring/3.6.3/keyring/)
