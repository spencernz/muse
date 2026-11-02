# Status
Complete. Automated acceptance and public catalog verification passed; live paid OpenAI and native relaunch verification remain explicitly unrun.

# Problem and outcome
Album lookup fails with generic catalog and incomplete-OpenAI messages. Make lookup work with the selected reasoning model, handle transient MusicBrainz responses, and avoid repeating a paid identification when only the catalog step failed.

# Scope
Model-aware bounded reasoning/output configuration for the existing OpenAI album request; precise redacted incomplete/refusal/service errors; bounded catalog retries respecting Retry-After and the existing request interval; short native cache of successful album identification keyed by model/context. Retain the selected model/key, review/apply semantics and provider isolation. No automatic paid retries, key access for debugging or remote file changes.

# Acceptance criteria
- A simulated reasoning model that exhausts the old 500-token limit can identify an album with the revised request policy, without changing the user's model.
- Incomplete/token-limit/content-filter/refusal failures are distinguished without returning raw model/provider errors.
- Transient catalog 429/503/5xx responses retry within a small time/attempt budget and respect bounded Retry-After; permanent request failures are not retried or called rate limiting.
- Retrying a failed catalog phase reuses a recent successful AI identification for identical model/context; model/context changes cause a fresh explicit identification.
- Deterministic regressions pass, public catalog requests are checked without OpenAI credentials, and the app is rebuilt. Record any unavailable live paid/UI checks.

# Decisions and open questions
Read only the non-secret configured model from Muse's settings: gpt-5-nano. No API key read or paid requests used for diagnosis. The previous 500-token cap was selected for a non-reasoning default and is insufficiently model-aware. A public catalog probe currently returns HTTP 200, so the user's catalog status needs better transient recovery and diagnostics rather than assuming a persistent outage. Keep cached identification in memory with a TTL and bound; do not cache credentials.
