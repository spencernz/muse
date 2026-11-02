# Steps
- [x] Inspect native config, installed Tauri schema, official configuration reference and existing layout.
- [x] Configure overlay title bar and hidden title; add transparent native drag region and macOS safe spacing.
- [x] Verify checks and rebuild release with the in-progress cover accent work.
- [ ] Relaunch release; inspect Home, album atmosphere and Now Playing, plus native dragging and controls.

# Validation
Run npm run typecheck, npm run lint, npm test -- --reporter=dot and npm run bundle. Verify native desktop screenshots and dragging. Existing standalone app is dark-only with 620px minimum native width; record unavailable narrow/platform coverage.

# Progress and decisions
Official Tauri reference confirms Overlay draws native title bar over content and requires a custom drag region: https://v2.tauri.app/reference/config/#titlebarstyle. Installed CLI schema confirms titleBarStyle and hiddenTitle. Read shared workflow/UI rules earlier in the active cycle. Existing unrelated work remains unstaged.

# Results
Pending.

Implementation: native macOS Overlay + hiddenTitle; macOS-only UI class reserves 48px before sidebar and standard content controls, and a transparent 32px drag region excludes traffic lights and the top-right Close button. Drag and double-click-maximize permissions are limited to the main window. Web preview and other operating systems retain their prior content spacing.

Final results: npm run typecheck, npm run lint, npm test -- --reporter=dot (48 tests) and npm run bundle all passed. Existing React virtualizer warnings and upstream Rust block future-compatibility warning remain. Cleanly quit prior release, reopened new bundle, and inspected actual dark Home and Now Playing at 1180px logical width (2360px screenshot). Native title text/separator absent; traffic lights sit directly on sidebar canvas, and Now Playing background reaches the top edge. Square Close stays visible. Album route, narrow width, double-click maximize and drag position verification remain pending: native drag attempt was interrupted by concurrent user app changes, so further input was stopped to avoid conflicts. No commits or staging.
