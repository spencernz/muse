# Status
Implementing.

# Problem and outcome
Rust CI fails in a fresh Muse checkout because six unit tests and two integration tests read audio fixtures from App Mono's sibling `backend` directory. Muse's Rust tests should pass from the standalone repository.

# Scope
Store the synthetic MP3, FLAC, and M4A fixtures in Muse and update test paths to use them. Preserve production behavior and test assertions.

# Acceptance criteria
- The focused remote-provider test reproduces the missing-file failure from a clean checkout before the fix and passes after it.
- All Rust tests pass from a checkout containing only Muse files.
- No Muse test references App Mono's sibling `backend` directory.
- Required typecheck and lint checks pass.

# Decisions and open questions
Reuse the small generated-silence bytes already used by these tests. Keep the existing AAC and ALAC fixtures. No user audio or credentials are involved.
