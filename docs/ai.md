# AI music features

Muse has one native OpenAI connection for album identification and mood playlist generation. Both are explicit user actions. Listening-history analysis is not implemented.

## Set up OpenAI

Open **Settings → AI → Configure OpenAI**, enter your API key and choose **Save AI settings**. The key is stored in the operating system credential store. Muse never returns it to the webview, writes it to SQLite/localStorage, puts it in a URL or logs it. The password field clears after saving. **Remove API key** deletes the credential.

The default model is `gpt-4o-mini`, consistent with the existing parent application's lightweight model convention; you can enter another model supporting the Responses API and Structured Outputs. The implementation follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). **Test saved connection** checks access to the selected model with an authenticated model lookup, without generating an AI response. A successful model check does not guarantee available generation quota.

An album search makes at most one OpenAI identification request. Successful identities are retained in native memory for 15 minutes (up to 32 contexts), so retrying a catalog failure with the same model and album metadata reuses the identification. A model or context change requires a fresh request. There are no automatic AI calls during Sync, playback or startup. A configured user API key is required; do not paste keys into chat or put them in committed configuration files.

## Search an album

1. Open an album and choose **Search album info**.
2. Muse sends a bounded album title, album artist, year and up to 32 track titles to OpenAI. It does not send audio, listening history, SSH hostnames, full paths, private keys or tokens.
3. AI identifies the likely album/edition. Muse verifies a match against MusicBrainz and downloads real cover art through Cover Art Archive. There is no manual per-track matching workflow, and AI does not provide arbitrary image URLs.
4. Review the suggested album title, album artist, year, genre and cover. Edit the fields if needed, then choose **Apply album info**. The genre defaults to the existing catalog value. Individual track titles/artists, track order and duration are preserved.
5. The changes are stored in Muse's catalog and artwork cache, linked to the existing track IDs. They survive later local and SSH rescans, even when a source tag refresh changes the original album grouping. Server files and local audio files remain unchanged.

If no new artwork is found, the existing cover is retained and the preview explains that. Cancel or a failed lookup applies no metadata; a downloaded preview image may remain in the artwork cache. Closing a lookup does not undo an AI request already sent. A source change during preview requires another search before Apply. Search results and album overrides are suggestions for review, not proof that a particular edition is correct.

Album identification allows up to 4,096 output tokens, including reasoning; original GPT-5/nano/mini models use minimal reasoning. Token-limit, content-filter and refusal responses have specific safe messages. Muse never automatically retries a paid generation. See [OpenAI reasoning token budgets](https://developers.openai.com/api/docs/guides/reasoning#allocating-space-for-reasoning).

Transient MusicBrainz HTTP 429/500/502/503/504 responses receive at most three attempts, with two/four-second backoff or a numeric Retry-After of up to eight seconds. Longer or date-form Retry-After values stop automatic retries. Permanent HTTP failures show their status without claiming rate limiting. MusicBrainz is queried at most once per 1.1 seconds per Muse process; requests use an identifying User-Agent. Network timeouts and response limits bound requests. Artwork starts at a validated Cover Art Archive release UUID, follows at most five HTTPS redirects restricted to Cover Art Archive/Internet Archive, has an 8 MiB transfer cap and passes the existing image dimension/allocation checks before being cached as a local JPEG. References: [MusicBrainz search](https://musicbrainz.org/doc/MusicBrainz_API/Search), [rate policy](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API).

## Generate a mood playlist

On Home, click one of four compact mood cards under **A mix for your mood** to generate that mix directly. Each mood has its own icon and color. Muse shows progress and any error below the cards. You can also choose **Create AI playlist** below the sidebar divider under Now Playing to use the separate mood picker. **Show other moods** offers the other four moods.

Muse randomly samples up to 400 catalog tracks marked available. Each candidate has a temporary number plus title, artist, album and genre (each field capped at 120 characters). Only these fields and the chosen mood are sent to the saved OpenAI model. Persistent track IDs, paths, hosts, credentials, listening history and audio are excluded. Library availability reflects the catalog; a remote source can still require reconnecting for playback.

One Responses API call with a strict JSON schema requests an ordered list of at most 20 candidate numbers. Native validation rejects unknown numbers, duplicates, empty or oversized lists, malformed output, incomplete responses and refusals. Metadata is explicitly untrusted input. Generation uses the existing timeout and original GPT-5 minimal-reasoning configuration, with no automatic paid retries.

After validation, Muse rechecks selected tracks and saves the playlist and ordered membership in one SQLite transaction. If the library changes or saving fails, the whole transaction rolls back. A successful result opens the playlist without starting playback. Saved playlists appear below the sidebar divider; existing rename/delete controls remain available. The dialog prevents repeated submissions or dismissal during generation, and native code rejects concurrent generation. An explicit retry after a successful request creates a separate mix.

Mood fit is a suggestion based on metadata and model knowledge, not audio measurement. A small library or limited matches can yield fewer than 20 songs. Large-library sampling can omit suitable tracks; another generation samples again. Missing keys, network/API errors and invalid output display actionable feedback and preserve the selected mood. Configure access in **Settings → AI**. Deterministic tests use a fake provider and do not spend API credit.

## Sync and duplicates

Repeated Sync updates existing records for the same source. Schema version 3 adds a canonical identity for the SSH hostname/port/account plus absolute file path, so overlapping roots reuse the same track instead of creating another copy. Existing aliases of that exact file are consolidated while retaining likes, playlist references, history and saved queue identities. Remote album IDs are independent of the selected root, and locally reviewed overrides are reapplied after source metadata refreshes.

Different file paths are not merged merely because titles match. A local copy and a remote copy, different SSH accounts/host aliases, and physically distinct files may still be separate entries. Muse does not download whole remote songs to calculate hashes or let AI delete perceived duplicates. The additive version 3 upgrade retains local/remote data, introduces override bindings, and rejects opening the newer catalog with older Muse binaries.

## Validation

Deterministic tests inject native credential/network seams and cover secure settings, structured-output handling, missing keys, errors, exact-file identity/migration, preview/apply/cancel, changed source tags, artwork limits/hosts and native/frontend behavior. The opt-in native `live_catalog_and_cover_contract` test checks a public MusicBrainz album and actual artwork without OpenAI credentials. A live billed OpenAI lookup remains dependent on a user-configured key; mock success must not be described as a live AI verification.
