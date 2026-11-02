# Steps
- [x] Inspect Home rendering, tile dimensions, shared Cover and existing controls.
- [x] Replace viewport-sized grid rows with capped container-based square cells.
- [x] Anchor tile artwork to its complete button bounds; retain captions/fallbacks.
- [x] Remove redundant sidebar local-first copy/import control and retain bottom-aligned settings.
- [x] Verify native Home at desktop/narrow widths and run relevant checks.

# Validation
Run existing Muse interaction tests for saved sizes/order and navigation. Visually inspect Home using native isolated preview catalog, including portrait/square covers, missing art, featured tile, compact actions, captions and tile editor. Run Muse build and root typecheck/lint. This CSS change has no useful jsdom layout seam; visual rendering, rather than implementation-mirroring style assertions, verifies the sizing correction.

# Progress and decisions
The old grid fixes four columns while its row height grows with viewport width. Replace this with responsive column counts, a 156px unit cap, 8px gaps and square grid cells. Artwork will be absolutely positioned within its tile to avoid percentage/intrinsic image sizing leaving unused tile area. Keep user-authored layout preferences.

# Results
Changed `muse/src/ui/home.tsx`, `ui/app.tsx`, `desktop.css`, `styles.css` and `metro.css`. A single wrapper provides an inline-size query container for the grid. At available widths below 480px use two columns; from 480px use four; from 800px use six. Units cap at 156px with 8px gaps (320px maximum featured tile). Grid rows and columns share the same container-based calculation. At 1180px window width the featured tile is approximately 298px; default tiles fit two rows and the album shelf is visible below.

Tile artwork and its image now use absolute positioning with inset zero, full width/height and object-fit cover. The native preview confirms no uncovered strip and no image distortion. Home Cover is keyed by artwork identity so failed-art state cannot leak when a recent-album tile changes source. Fallback titles are positioned away from the caption; below 480px, redundant fallback title text is hidden because the caption already includes title/artist. Captions and accessible button names remain available.

Removed the sidebar's local-first/no-streaming text, duplicate import button and unused style selectors. Settings uses margin-top:auto to remain at the bottom. The top-right import control and empty-library import actions are retained.

Validation:
- `cd muse && npm test`: passed, all 17 tests, including saved tile resizing/order, navigation and import failure/retry behavior. No implementation-mirroring CSS unit tests added; jsdom cannot establish the layout result.
- `make typecheck`: passed against final changes (frontend and Muse).
- `make lint`: passed against final changes (backend, frontend and Muse).
- `cd muse && npm run build`: passed.
- Native debug preview builds: passed for an isolated desktop catalog and 320px narrow window, without modifying the user's main library.
- Native Home visual inspection at 1180×800: compact two-row default collection; square edge-to-edge artwork, coloured action tiles, captions and album shelf visible; redundant sidebar block absent and settings at bottom.
- Native Home visual inspection at 320×800: two columns, featured tile fits available width, readable caption, search/import/settings/player retained, no horizontal overflow. Initial screenshot attempts were resized before capture; restarting and capturing in one tool call successfully verified the narrow window. Final small-screen fallback rule only removes duplicate title text while retaining the caption.
- Existing tile resize/order interaction tests protect the editor; editor overlay was not separately visually rechecked. Muse's existing appearance is dark/English only. Reduced motion uses existing global rules; other operating systems untested.
- `git diff --check`: passed. No commits or staging; pre-existing unrelated workspace edits retained.
- Final `cd muse && npm run bundle`: passed. Deliverable is `muse/src-tauri/target/release/bundle/macos/Muse.app`.
