# Repository workflow

For each feature, behavior change, bug fix, or refactor, read [the implementation workflow](docs/workflow.md). Save and maintain the cycle spec and plan before changing application code. Repository setup and documentation-only edits do not require a cycle.

Before changing UI layout, styling, components, interaction, or user-facing copy, read [the Muse UI rules](docs/ui-rules.md).

Before every commit, run `make typecheck` and `make lint` from this repository root against the final changes. Both must pass. If either fails or cannot run, report the blocker and leave the work uncommitted. Run relevant tests as specified in the workflow.

Commit only when requested or authorized by the user. Inspect the working tree and stage task files explicitly, preserving unrelated changes.
