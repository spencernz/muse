# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
Make the content Back and immersive Now Playing close buttons visually quiet: icon-only at rest, square background and border on hover.

# Scope
Shared Back/Now Playing X styling only. Preserve icon sizes, 48px hit targets, routing, Escape behavior and keyboard focus outline. No radius or layout change.

# Acceptance criteria
Both controls have transparent background/border at rest and a visible square background/border on hover. Keyboard focus remains visible. Existing navigation tests/build pass and record visual verification.

# Decisions and open questions
A transparent 1px border reserves space so hover causes no movement. The user's latest direction supersedes the prior always-bordered Back/X design.

# Home navigation follow-up
Hide the content back button on Home, even if history exists. Other pages retain the same back action, layout and focus behavior. Home breadcrumb aligns to the content gutter.
