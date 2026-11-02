# Muse

A local-first Tauri 2 desktop music player built from the supplied [Modern Metro prototype](design/muse_metro_prototype.html). React, TypeScript, Tailwind and Zustand render the interface; Rust owns the catalog, files and playback. The installed app works entirely offline.

## Run and build

```sh
npm install
npm run desktop
```

Rust and Xcode are installed on this Mac. Build the independent offline application with `npm run bundle`, then open `src-tauri/target/release/bundle/macos/Muse.app`. The app needs no development server or cloud account. `npm run dev` is a UI preview only; native features require the desktop shell.

Run these commands from the Muse repository root. Mac ARM64 is the verified target; other operating systems require their Tauri prerequisites and remain unvalidated.

## Use

1. **Import music** selects one or more source folders. Muse reads tags and embedded artwork recursively, without changing source files. Changes are discovered through filesystem notifications and periodic reconciliation.
2. **Library** browses Albums, Artists, Songs and Genres with sorting. Search uses a local full-text index. Double-click a track row, activate its title with the keyboard, or choose **Play album**.
3. The persistent mini-player provides playback controls. **Now Playing** includes artwork, seeking, favourites and one control row: volume on the left, playback in the centre, then AirPlay and queue on the right. Click the volume icon for mute and the volume slider. Queue tracks can be played, moved or removed. Shuffle visits each queued track before repeating; repeat cycles Off → All → One.
4. Select tracks with checkboxes to add them to a playlist or queue. **Playlists** creates, renames and removes playlists. These actions do not change audio files.
5. Pin albums or artists from their pages. **Edit tiles** on Home supports dragging, keyboard reorder, resizing and unpinning. Tile layouts persist in SQLite.
6. **Settings → Local music folders** shows connected sources, scan status, and unreadable-file details. Disconnecting a drive marks its tracks unavailable while preserving metadata, favourites, playlists and history. Stopping a scan retains previous entries. **Remove folder** removes songs with no other source from the catalog, playlists, history and queue while keeping the original music files. Songs backed by another folder or SSH source remain; restarting also cleans up source-less records left by earlier folder removals.

The sidebar and scrolling content share a charcoal canvas above a full-width player. Back, breadcrumbs, search and import are inside the content panel; Back follows this session's navigation history. At narrower window widths the sidebar becomes an icon rail and player controls wrap. Now Playing hides the footer and provides its own seeking, transport, mute, volume and queue controls using the same playback state and square-thumb sliders. Album edition/disc suffixes are separated for display without changing file tags. Cover-tinted blur extends behind the album header and contextual navigation, and fills immersive Now Playing content; sidebar and footer stay solid charcoal. Home artwork-tile captions appear on hover or keyboard focus (always visible on non-hover devices).

Opening an album from an album grid emphasizes its artwork, scatters visible neighbors and carries a shared artwork clone to the detail hero. Back reverses the journey, restoring the grid's sort, scroll and keyboard focus. The native Web Animations API animates only content; reduced motion, unloaded artwork and unavailable source tiles use an immediate or brief fade fallback. Resize, scroll and unrelated navigation cancel temporary projections safely. No animation library is required.

In **Music folders → Background playback**, choose **When closing the window → Keep running in background** to close the interface while listening. The default remains **Quit Muse**. Left-click the Muse tray/menu bar icon to return; right-click for **Show Muse**, **Play/Pause**, **Next**, **Previous** and **Quit Muse**. On Linux, use the tray menu’s **Show Muse** action (tray click events are not supported by Tauri). A tray host/desktop extension may be required on Linux. Explicit Quit always ends playback and exits. Muse never registers itself to start at login.

The first background close sends a native notification, subject to OS notification settings (Windows requires an installed app for notifications). Queue, volume, position, shuffle and repeat remain owned by the existing native audio thread. Hidden webviews may be throttled without interrupting decoding, queue advancement or system media controls. Restoring publishes a fresh native playback snapshot. Reopening Muse uses the existing process/window; a normal relaunch after quitting restores the saved queue paused.

Keyboard shortcuts outside fields/dialogs: Space play/pause; Left/Right seek five seconds; Command/Ctrl + Left/Right previous/next; Up/Down volume; S shuffle; R repeat; M mute. Native OS media commands are connected through Souvlaki; status is shown in Music folders.

## Storage and identity

On macOS the SQLite database, user state and artwork cache live in `~/Library/Application Support/local.muse.player/`. Back up this directory to retain playlists, favourites, history, queue and tiles. Audio stays in its source folders. An isolated QA build uses a different app identifier and catalog.

Scans compare file size and modification time and hash new/changed files. Byte-identical copies share a track; moves match by content hash; edits at the same path preserve identity. Missing/deleted files become unavailable instead of destroying user preferences. Symlinks inside selected folders are not followed. Missing tags fall back to filenames/folder names. No online guesses are made.

Embedded pictures are validated and cached as JPEGs up to 600 pixels; smaller images retain their size. Invalid or missing artwork uses the prototype's text-and-color fallback. MP3, FLAC, WAV, AAC/M4A and ALAC decode through Rodio/Symphonia. Corrupt or DRM-protected audio may be unreadable; no transcoding is performed.

## Architecture

- `src/ui/`: prototype-based screens, dialogs and controls; TanStack Virtual renders long track and queue lists.
- `src/store.ts`, `src/native.ts`: Zustand state and typed Tauri commands. Tracks load in 200-row pages; search is debounced. Clock events carry a small payload rather than repeatedly copying the whole queue.
- `src-tauri/src/lib.rs`: native commands with blocking work dispatched off the UI thread.
- `db.rs`, `schema.sql`: SQLite WAL repositories, indexes and FTS5. Each worker has its own connection.
- `scanner.rs`, `metadata.rs`: background reconciliation, change detection, metadata and artwork.
- `desktop.rs`: persisted close preference, native tray, hide/restore lifecycle and exit checkpoint.
- `audio.rs`, `queue.rs`: a dedicated native playback thread, output stream, seeking, queue order and media controls.

The packaged frontend only connects to Tauri IPC and cached local artwork.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
cd src-tauri
cargo test --offline
cargo clippy --offline --all-targets -- -D warnings
```

Tests use generated audio and temporary databases. They cover scanning, moves, duplicates, missing drives, corrupt files, source immutability, metadata changes, cached artwork, codecs, playlist order, favourites, queue repeat/shuffle and 12,000-track search/virtualization. Runtime use is offline; the initial dependency installation/build requires package downloads.

## Remote music source (SSH / SFTP)

Open **Settings → Remote music → Manage SSH / SFTP** to connect with an existing SSH key, verify the server fingerprint, browse folders read-only and save a music folder. Choose **Sync catalog** to index remote metadata/artwork, then play tracks with a cloud on the cover through the existing player. Audio stays on the server; local music remains available. See [SSH/SFTP setup and security](docs/sftp.md).

Plex is currently hidden from navigation and settings. Its implementation and stored configuration remain intact; see [Plex Phase 1 notes](docs/plex.md).

## AirPlay and audio output

Use the **AirPlay / audio output** button in the playback bar or Now Playing. Choose an output and **Use this output**. Muse keeps its current track, position, queue and volume while changing the audio device. **System default** follows the output selected by macOS.

On Mac, connect an AirPlay speaker in **Control Center → Sound** first if it is not listed, then **Refresh outputs** in Muse. The picker can open Sound settings directly. macOS handles receiver discovery, pairing and AirPlay delivery; Muse uses the Core Audio device it exposes. See [AirPlay setup and limitations](docs/airplay.md).

## AI album info

Configure your OpenAI API key in **Settings → AI**, then open an album and choose **Search album info**. Muse identifies the album from its metadata/track list, finds real catalog artwork, and shows a review before **Apply album info**. Approved metadata and covers are saved locally and kept through rescans; audio files stay unchanged. Repeated SSH sync also reuses exact file identities across overlapping roots. See [AI setup, privacy and duplicate handling](docs/ai.md).

## AI mood playlists

Choose a square mood tile under **A mix for your mood** on Home, or **Create AI playlist** below Now Playing in the sidebar. Pick one of four shuffled moods, or **Show other moods**, then **Generate playlist**. Muse uses your saved OpenAI connection to choose at most 20 unique, available tracks from your library, saves the ordered playlist and opens it. Saved playlists appear below the sidebar divider and can be played, renamed or deleted through the existing playlist view. Generation never starts playback.

Only bounded song, artist, album and genre metadata is sent to OpenAI. Large libraries use a random sample of up to 400 available tracks per request. Small libraries or limited mood matches may produce fewer than 20 songs. AI suggests mood matches from metadata; it does not analyse audio. Connection, quota and validation failures create no partial playlist and can be retried. See [AI details](docs/ai.md#generate-a-mood-playlist).

## Playlist artwork and artist albums

Playlist cards (including Favourites) preview up to five unique album covers from their tracks. Different mosaic layouts fill the tile. If more artwork is available, one cover changes every four to seven seconds with a short fade. Rotation pauses when hovered/focused, offscreen, hidden or reduced motion is enabled. Missing art retains the playlist icon.

Artist pages show related album covers above Songs. This includes compilations containing tracks by the selected artist; a cover opens the existing album page.

## Background mini player

In **Settings → Background playback**, choose **Keep running in background**. Closing a fullscreen window exits the native fullscreen space before hiding Muse. When the main window is hidden/minimized, click the Muse tray/menu-bar icon to open a compact player with current artwork, previous, play/pause, next and Favourite. **Open Muse** or the macOS Dock icon returns to the full window. Escape, X or switching focus dismisses the mini player while music continues. Windows hidden applications use the tray icon; Linux tray support depends on the desktop. The compact window controls the same native audio player.

The compact player anchors below the clicked menu-bar/tray icon (or above a bottom taskbar when needed) and blurs the current album cover behind readable controls. Home has no back button. Native fullscreen exposes an explicit Exit fullscreen button and uses native title-bar space while active.

## License and third-party content

Muse is released under the [MIT License](LICENSE), © 2026 Spencer Hu.

- **Your music stays yours.** The repository contains no commercial audio, artwork or lyrics. Test fixtures are generated silence (see `src-tauri/tests/fixtures/README.md`). The design prototype (`design/muse_metro_prototype.html`) was created by Spencer Hu with AI tools, and its album names are fictional.
- **Lyrics** are fetched at runtime from [LRCLIB](https://lrclib.net) and are not stored in this repository.
- **Retro visualizer:** uses [butterchurn](https://github.com/jberg/butterchurn) (MIT). Its MilkDrop presets come from the `butterchurn-presets` npm package and are compiled into `src/visualizer/retro-presets.ts` on `npm install`. That file is gitignored, so this repository does not redistribute preset content. Each preset remains the work of the artist named in its title. License texts ship in `public/licenses/`.
- **Music profiles (optional):** the Essentia runtime (AGPL-3.0) and musicnn model weights (CC BY-NC-ND 4.0) are downloaded on demand from their publishers and are not part of this repository. The model weights are licensed for non-commercial use only, so any commercial use of Muse must leave this feature disabled.
- **Visualizer artwork** in `public/visualizers/chalk-pals/` was generated for this project with an AI image tool; see `docs/cycles/2026-11-01-chalk-pals/artwork.md`.
- npm and Cargo dependencies keep their own licenses.
