# Lyrics

Open Now Playing and choose **Lyrics**. The tab replaces song details/actions while artwork, seek and transport remain available. Arrow keys and Home/End switch the two tabs. LRCLIB lookup runs on opening Lyrics and uses catalog title, artist, album and duration for local or SSH tracks. No audio or file paths are sent.

Synced LRC highlights the current line and clicking a line seeks through the existing player. Plain lyrics remain scrollable. Instrumental, missing matches and temporary service failures have separate states. Retry is explicit.

The source/import footer has been removed at the user’s request. Native imported overrides remain supported internally, but Now Playing has no import action. Embedded tag extraction, alternate-match search and import management UI are deferred. Both views share a stable content height; automatic lyric scrolling is confined to the lyrics list.

Online lyrics are held in native memory for 15 minutes with a 64-context bound; they are not permanently cached. HTTP requests have a 12-second timeout, 256 KB response cap, fixed HTTPS host and no redirects. Records must match title/artist and duration within two seconds. No match is preferable to lyrics for another version.

Source: [LRCLIB API](https://lrclib.net/docs). Public distribution and offline caching rights need separate review from API accessibility.
