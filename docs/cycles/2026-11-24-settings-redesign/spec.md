# Status
Implementing.

# Problem and outcome
Settings is one long column of eight unrelated sections (local folders, scan issues, remote music, background playback, music analysis, AI, shortcuts, about) with no grouping, inconsistent heading weight and status messages mixed between actions. Users cannot find a setting without scrolling the whole page. Muse is also dark-only.

Users should find settings by category, and choose a Light, Dark or System (follow device) appearance.

## Analysis of the current page
- No categories or in-page navigation; every section has the same visual weight, so reference material (shortcuts, about) competes with configuration.
- The local folders section puts scan output and "Files needing attention" between its buttons and the folder list.
- Remote music is a bare link without any connection status; its copy says SSH key only.
- Music analysis and AI are long inline panels at the bottom of an already long page.
- The page has no appearance controls; colours are hard-coded for dark.

# Scope
Included:
- A Settings layout with a category list beside the selected panel: **General** (Appearance, Closing the window), **Library** (Local folders, Files needing attention, Remote music), **Intelligence** (Music analysis, AI), **Shortcuts** (keyboard and media controls), **About**.
- The category list is a keyboard-accessible vertical tab list (arrow keys, Home/End). At narrow widths it becomes a horizontal, scrollable row above the panel.
- Deep links keep working: `navigate("settings", "analysis")` and `navigate("settings", "ai")` open Intelligence. The selected category persists for the session.
- Appearance: System (default), Light, Dark. System follows the OS `prefers-color-scheme` and updates live. The choice is saved per device and applied before first paint. The native window theme (title bar) follows the choice.
- Light theme across the app shell: sidebar, content, player bar, dialogs, forms, lists, settings and SSH screens. The cover-derived accent and album atmosphere get a light variant with the same contrast targets (4.5:1).
- Each settings panel uses grouped cards with a title, description and controls; status and errors stay inside their group.

Excluded and intentional departures:
- Now Playing, the visualizer and the mini player (which sits on blurred artwork) stay dark in every theme. Home tile captions, which sit on artwork, also stay dark.
- No change to what the settings do, and no new settings besides appearance.

# Acceptance criteria
- Settings shows five categories; selecting one shows only its panel; arrow keys move between categories; the active category is announced (`aria-selected`).
- Opening settings with context `analysis` or `ai` selects Intelligence and expands analysis for `analysis`.
- Appearance offers System, Light and Dark; changing it updates the app immediately without reload and persists across restarts. System follows OS changes while open.
- In Light, text and controls meet 4.5:1 contrast against their backgrounds; no dark-only surface remains in the shell, settings, library, SSH, playlists or dialogs. In Dark, the app looks as before.
- Remote music card shows the connection summary and works with password or key copy.
- Narrow window (620px): category row scrolls horizontally, panels have no horizontal overflow.
- Existing settings behaviours (add/rescan/stop/remove folders, close preference, analysis, AI) keep working and their tests pass. New tests cover categories, deep links and the theme choice.
- `make typecheck`, `make lint` and `npm test` pass.

# Decisions and open questions
- The user asked for a redesign and Light / follow-device options (2026-11-24). Category grouping and the vertical tab layout are my design choice, following macOS/Windows settings conventions.
- The theme is stored in `localStorage` (`muse.appearance`) so it can apply synchronously before React renders and is shared with the mini-player window. It is a per-device display preference, not library data.
- Now Playing stays dark in Light mode to preserve its cover-driven immersion.
