# Status
Implementing.
# Problem and outcome
Now Playing notifications overlap the native traffic lights and the Close Now Playing button. Notifications must remain readable and independently dismissible.
# Scope
Now Playing notification positioning only; retain other pages' notices and player behavior.
# Acceptance criteria
- Notice begins below the 16px + 48px window-control row with an 8px gap.
- Long messages wrap at narrow widths and their dismiss button stays reachable.
- Showing/dismissing a message does not shift Now Playing content.
- Existing alert/status semantics and dismissal remain intact.
# Decisions and open questions
Use a compact fixed notice below the controls, with 16px viewport gutters. Preserve Muse's square neutral surfaces. Native visual inspection remains required.
