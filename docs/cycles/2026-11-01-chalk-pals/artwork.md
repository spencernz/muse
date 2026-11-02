# Artwork provenance
The Chalk Zoo expansion adds eight individually generated 1254×1254 transparent PNGs, inspected for intact heads and copied from the built-in imagegen tool's saved outputs:

- lion: public/visualizers/chalk-pals/lion.png
- elephant: public/visualizers/chalk-pals/elephant.png
- giraffe: public/visualizers/chalk-pals/giraffe.png
- panda: public/visualizers/chalk-pals/panda.png
- penguin: public/visualizers/chalk-pals/penguin.png
- koala: public/visualizers/chalk-pals/koala.png
- monkey: public/visualizers/chalk-pals/monkey.png
- owl: public/visualizers/chalk-pals/owl.png

Prompt template (replace {animal} with each filename):

> Use case: stylized-concept. Asset: one transparent high resolution animal head sprite for Muse Chalk Zoo visualizer. Use supplied dog only as medium and pastel-chalk STYLE reference, not subject. Draw one friendly {animal} with a clearly recognizable species-specific face and ears/beak, cartoon charm, fine irregular pastel chalk grain, pencil strokes, broken edges and soft ivory/peach plus natural species accents. Head centered on a square transparent canvas with 12 percent clear margin on every side; no clipping, all ears/whiskers inside. At least 1024px square. No other animal, no photo, no vector icon, no emoji, no board/background, no text.

The original four animal files remain. All twelve are separate assets; runtime rasterizes and caches them at 512px and releases source images after decoding. Source artwork was generated with the built-in tool, without using Muse's OpenAI key.

Built-in imagegen mode, with transparent_background=true. Four separate generated PNGs, each1254×1254 with alpha, inspected for intact ears/whiskers and pastel chalk texture. Copied originals into public/visualizers/chalk-pals/{dog,cat,rabbit,fox}.png. Runtime caches512px textures and bounded erosion stages; source resolution is retained in the assets.

Reference: initial four-animal atlas exec-532f664b-8388-4625-a367-55cbc16b5ba6.png, rejected because heads crossed cell boundaries. Original generated files remain under ~/.codex/generated_images/01a18ea8-25b8-7d82-abdf-d21bef73566d/.

# Prompt set
The following prompt was used once per animal, substituting dog/cat/rabbit/fox:

Create one single dog head as a high-resolution transparent sprite for Muse Chalk Pals. Use the supplied image as STYLE reference: authentic hand drawn pastel chalk, pencil-like strokes, irregular grainy edges, delicate ivory, pale peach and blush colour variation. Charming friendly expression, real detailed chalk strokes, not emoji, not smooth vector, not 3D. Only ONE dog head centered in a square, all ears, fur and whiskers fully inside the image with generous 12% transparent margin on every side. No other animals, no atlas, no background board, no text or frame. Preserve genuine alpha and fine chalk texture. At least 1024px square.
