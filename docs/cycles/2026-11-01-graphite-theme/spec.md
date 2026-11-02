# Status
Implementing. Code/checks/final release build complete; native visual signoff pending.
# Problem and outcome
Replace Muse's blue/purple default with the approved Graphite palette: #151515 canvas, #222222 panels and #EEEEEE active accent.
# Scope
Neutral default surfaces, text, controls, navigation, ranges, home tiles and mood tiles. Keep real artwork colorful and retain scoped artwork-derived album/Now Playing atmosphere. Default navigation and bottom bar use Graphite; active playback retains artwork-derived accents, per the user’s clarification. No layout/player changes.
# Acceptance criteria
Default UI without a usable cover is grayscale; selected navigation uses white with a grey surface/marker, primary/play controls white with black icons, ranges white. Artwork-derived Now Playing still updates with covers. Missing/greyscale artwork falls back to Graphite. Checks and release build pass; record visual inspection limits.
# Decisions and open questions
User approved Graphite. Neutral theme supersedes earlier default blue and colored mood accents; unique mood icons remain. Follow existing Metro square geometry and English desktop conventions. Existing album-page artwork atmosphere stays scoped to its album page.
