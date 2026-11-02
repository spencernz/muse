# Status
Implementing.
# Problem and outcome
Remove the Petals visual effect at the user's request. The Visual Effects selector should show only Spectrum, Wave, Retro, Fire and Chalk Zoo.
# Scope
Remove Petals from active modes, engine, source/tests and packaged artwork. Preserve generic transparent animal texture loading for Chalk Zoo. Saved Petals and legacy Nebula preferences migrate to Spectrum. Playback and other visuals remain.
# Acceptance criteria
Petals absent from UI/shuffle and bundle. Old saved selection opens Spectrum without error. Five remaining modes work, including fullscreen. Tests/build/relaunch pass.
# Decisions and open questions
Delete unused petal implementation/assets after removing imports. Keep old docs as history.
