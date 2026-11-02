# Steps
- [x] Inspect the failed GitHub Rust job and reproduce one failure from an isolated archive of Muse.
- [ ] Copy synthetic fixtures into Muse and update all Rust test references.
- [ ] Run focused and full Rust tests from the isolated archive, plus required checks.
- [ ] Review the diff and GitHub CI result.

# Validation
The isolated archive is under `/private/tmp/muse-ci-repro-6d6n3H`, with no sibling backend. Re-run the focused provider test after the fix, then the full `cargo test --offline --locked` suite there. Run `make typecheck` and `make lint` from Muse root.

# Progress and decisions
GitHub CI run `41407178859` passed frontend checks and failed Rust: 49 passed, six failed at `src/providers/remote.rs:753` with a missing MP3 fixture. Two integration test files also reference the sibling backend. The isolated focused test reproduces the exact `No such file or directory` panic.

# Results
Pending.
