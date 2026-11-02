# Steps
- [x] Reproduce token-limit and catalog-retry failures with deterministic regression tests.
- [x] Add model-aware request policy and specific safe response diagnostics.
- [x] Add bounded MusicBrainz retries and identification reuse after catalog failures.
- [x] Run tests/public catalog check, build release and record verification limits.

# Validation
Use fake OpenAI transport that returns incomplete below a reasoning budget, fake catalog HTTP status sequences and injected waits for instant retry-policy tests. Verify no paid retry, cache reuse/invalidation, permanent error behavior and Retry-After caps. Run relevant/all native tests, frontend checks and release build. Live public MusicBrainz GETs are allowed; do not retrieve the user's key or invoke billed requests. UI inspection only if native window access returns.

# Progress and decisions
Read diagnosing-bugs workflow and official OpenAI reasoning documentation. Source request hardcodes 500 max output tokens and collapses all incomplete statuses. MusicBrainz collapses every non-2xx response into a rate-limit message. Public query returned 200 with eight results. Saved model is gpt-5-nano, read without accessing credentials. Both deterministic regressions failed against the old behavior before the fix: nano received the generic incomplete error; the temporary catalog status was not retried. The repaired request allows 4,096 tokens and minimal reasoning for original GPT-5 model IDs/snapshots. Other models retain their default reasoning policy. Successful identities are held only in native memory for 15 minutes, bounded at 32 contexts. Catalog retries never repeat paid identification.

# Results
- `cargo test --manifest-path src-tauri/Cargo.toml --quiet`: 64 passed, two opt-in live tests ignored. Final run required escalation for local HTTP test sockets; sandbox-only rerun failed three provider tests with OS PermissionDenied, then the unrestricted suite passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `npm run typecheck && npm run lint && npm test`: passed; 79 frontend tests.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib live_catalog_and_cover_contract -- --ignored --nocapture`: passed against public MusicBrainz and Cover Art Archive, eight candidates and real artwork. No OpenAI credentials used.
- `npm run bundle -- --bundles app`: passed; release Muse.app rebuilt at `src-tauri/target/release/bundle/macos/Muse.app`, 18.58 MiB. Quit and reopen this release bundle to load the changes.
- No UI layout changes. No paid OpenAI request or key retrieval by the agent; deterministic wire tests verify the new request/response contract, not a live model answer. Existing native window capture is unavailable, so relaunch remains a user step. No commit requested or made.
