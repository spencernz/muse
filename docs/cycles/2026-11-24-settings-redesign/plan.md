# Steps
- [x] Theme tokens: extend the `:root` tokens in a new `theme.css` (dark values = current look; light values under `[data-theme="light"]`; Now Playing re-declares dark tokens). Replace hard-coded shell colours in styles/desktop/metro/unified-layout/ai-playlists/playlist-collage/scrollbars/background-player with tokens.
- [x] `appearance.ts`: preference (system/light/dark) read/write via localStorage, resolve via matchMedia, apply `data-theme` and `color-scheme` on `<html>`, set the native window theme; apply before render in `main.tsx`; live system updates; sync across windows.
- [x] Light variant of the album atmosphere (accent/muted/background/surface derived against a light base with 4.6:1 contrast loops).
- [x] Settings redesign: category tab list + panels, grouped cards, Appearance controls, deep links, narrow layout.
- [x] Capability: `core:window:allow-set-theme` for the main and mini-player windows.
- [x] Tests: appearance resolution/persistence, settings categories and keyboard, deep link, theme radio; light atmosphere contrast. Update existing settings tests.
- [x] Docs: README Settings/Appearance.

# Validation
- `npm test -- --reporter=dot`, `make typecheck`, `make lint`.
- Release build; inspect Settings, Library, Album, SSH and dialogs in Light and Dark at normal and 620px width; Now Playing stays dark; System follows an OS theme change.

# Progress and decisions
- Tokens live in `src/theme.css`, imported first. 95 shell colour literals were replaced by property-aware mapping (text/background/border buckets). Artwork-backed selectors (tiles, artwork, playlist cards/collages, mood tones, remote cover icon, dialog backdrop) were left as they are. The duplicate tokens in `unified-layout.css` were removed in favour of `theme.css`.
- Light accent is derived per cover: `lightAtmosphere()` recovers the cover colour from the dark background (`mix(ink, colour, 0.12)`), then re-derives against paper with the same 4.6:1 loops. The default cover maps to `defaultLightAtmosphere`. Now Playing still uses the dark palette.
- The appearance preference is stored in `localStorage` and applied in `main.tsx` before render (main window only). `storage` events keep windows in sync. `matchMedia` changes are followed in System mode. The native window theme is set via `setTheme`, with `core:window:allow-set-theme` added for the main window.
- The settings category is remembered for the session (module variable). Context `analysis`/`ai` selects Intelligence; `sources`/`remote` select Library.
- Screenshot inspection found: tab labels centred by the global button style (fixed with `justify-content`), secondary buttons invisible on cards (given a canvas fill and border in cards, and a border everywhere in Light), and oversized summary text (fixed at 14px).

- User report (light album page unreadable): the album backdrop kept its dark ink overlay, and `AlbumScreen` (`library.tsx`) used the dark cover palette directly. Fixed with a paper overlay in Light and a shared `useAppearanceAtmosphere` hook used by `AlbumScreen` and `app.tsx`. Verified with a preview using a synthetic orange cover: pale tinted background, rust accent `#964525`, readable title and metadata. Headless Chrome freezes CSS transitions under virtual time, so screenshots need transitions disabled to show final colours.

# Results
- `npm test -- --reporter=dot`: 25 files, 146 tests pass (new `settings.test.tsx`: categories and keyboard, deep link, appearance persistence and System following; new light palette contrast test; two existing tests now open the Library tab).
- `make typecheck`, `make lint`: pass.
- UI inspection: headless Chrome screenshots of the Vite preview at 1180×800 and 640×800. Settings (General, Library, Intelligence, Shortcuts) in Light and Dark, plus Home, Library, SSH and Now Playing in Light. Dark matches the previous look; Now Playing stays dark; the narrow layout shows a horizontally scrolling category row with no page overflow. The preview has no native backend, so populated folder lists, album atmosphere with real covers and the native title-bar theme were not seen.
- Not verified: the real desktop app in both themes, including the native title bar following the choice, album pages with real covers, keyboard focus rings in Light, and the startup window background (the native window background colour is still dark, so Light may briefly show a dark frame at launch).
