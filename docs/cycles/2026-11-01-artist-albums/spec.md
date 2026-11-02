# Status
Implementing. Code, automated checks, release replacement and relaunch complete; native visual/OS signoff remains pending.
# Problem and outcome
Artist pages should show album covers above the existing song list, with album navigation.
# Scope
Reuse AlbumCard and library artwork. Resolve album IDs using the same track-artist OR album-artist membership as the artist song query, including compilations. Alphabetical albums, responsive rows. Songs/play/shuffle/sort/pin behavior retained.
# Acceptance criteria
Only artist-related albums appear; track artists on compilations are included. Album cards open existing album page. Song controls/list remain below albums. Artist changes or rescan refresh membership and ignore stale requests. Empty/loading/error data doesn't remove songs.
# Decisions and open questions
Existing album summaries identify album artist only, so a tiny native distinct-ID query is needed to include contributing track artists correctly. Reuse existing grid/Card styling and Metro conventions.
