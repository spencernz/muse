# Status
Implementing: code, checks and release build are finished; final native visual/hardware checks remain pending because window capture is unavailable.

# Problem and outcome
The bordered Remote · SSH labels are visually intrusive. Replace them with a quiet cloud icon on remote covers.

# Scope
Small cloud indicator at the top corner of remote album covers, including album detail, mini-player and Now Playing. Remove bordered text badges from cards, track rows and player metadata. Keep an accessible source label and tooltip. No provider/player behavior changes.

# Acceptance criteria
Remote covers display a subtle cloud with an accessible name/tooltip; local covers have no indicator. No bordered Remote text tags remain in the catalog/player. Existing interactions and the pending merged toolbar continue to work; tests/build pass and record visual inspection.

# Decisions and open questions
The user offered cloud icon or hiding the tags. Use a quiet cover icon to retain source identification; hide track-row text tags. Keep the established dark, square Metro style and do not add a pill or bordered badge.
