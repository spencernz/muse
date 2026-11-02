# Status
Implementing. Code, automated checks, release replacement and relaunch complete; native visual/OS signoff remains pending.
# Problem and outcome
Replace flat playlist tiles with live album-art collages: up to five unique covers, varied sizes filling the tile, one changing every few seconds. Preserve readable title/count and existing navigation.
# Scope
Playlist list including Favourites. Fetch only artwork belonging to each playlist, deduplicate, use a bounded pool of 50 covers and gap-free layouts for 1–5 images. Rotate a single slot with a short crossfade; pause offscreen, hidden, hovered/focused or reduced-motion. No playback changes or external images.
# Acceptance criteria
At most five visible collage slots; fewer covers fill available space without duplicating covers. Different cover counts/layout variants remain fully filled. Rotation never repeats an already visible cover and only changes one slot. Missing/broken art and errors retain a navigable icon card. Playlist membership changes refresh the pool. Reduced motion is static. Titles/counts remain readable and accessible.
# Decisions and open questions
Reuse native artwork asset protocol and existing square tiles. Artwork color is intentional against Graphite UI. Solid translucent caption surface keeps text legible. Native metadata query returns only cover paths, bounded to 50 distinct covers per playlist.
