# Implementation cycles

## 1. Define the change

Inspect the current code and working tree. Reuse the existing cycle when continuing the same task; otherwise create `docs/cycles/YYYY-MM-DD-short-name/` using the local date. Add a suffix if needed to avoid a collision.

Write `spec.md` with these headings:

- **Status:** draft, implementing, complete, or blocked.
- **Problem and outcome:** who needs the change and what they should be able to do.
- **Scope:** included behavior and explicit exclusions.
- **Acceptance criteria:** observable results, including relevant error and empty states.
- **Decisions and open questions:** assumptions, user decisions, and unresolved requirements.

Completion criterion: each requested behavior has a checkable acceptance criterion. Ask about missing requirements that materially affect the result; proceed with documented assumptions for routine implementation choices. Writing a spec does not introduce a separate approval gate when implementation is already authorized.

## 2. Plan the work

Write `plan.md` in the same folder with these headings:

- **Steps:** ordered checkboxes identifying the affected components and dependencies.
- **Validation:** checks tied to acceptance criteria, relevant tests, and any UI inspection.
- **Progress and decisions:** completed work, scope changes, and why choices changed.
- **Results:** exact commands and outcomes, remaining limitations, and a concise handoff.

Include migration or compatibility steps when data or API contracts change. Scale the plan to the task; a small fix can have a short spec and a few steps.

Completion criterion: the plan covers every acceptance criterion and identifies how each will be verified.

## 3. Implement and maintain the record

Implement the plan in coherent steps. Update its checkboxes as steps finish. If requirements change, update the spec and plan in the same cycle before implementing the new scope. Record consequential decisions and unresolved blockers so another session can continue from the files.

Keep secrets and credentials out of these documents. Use synthetic examples.

Completion criterion: implemented behavior matches the current spec, and the plan accurately describes what remains.

## 4. Verify and finish

Run tests appropriate to the behavior changed. Rust changes normally need affected Cargo tests; frontend behavior changes need affected Vitest tests. Add regression coverage for meaningful bugs. For UI changes, apply the inspection checklist in [UI rules](ui-rules.md). Documentation-only work needs link and content review rather than application tests.

Run the mandatory commit checks in [AGENTS.md](../AGENTS.md) before committing. Record the exact commands and results in the plan, distinguishing passed, failed, and unrun checks. If later code changes invalidate a check, rerun it. Existing failures still block a commit unless the user explicitly changes the requirement.

Review the final diff for scope, accidental data, and completeness. Mark the cycle complete only when all acceptance criteria have been verified; otherwise record the remaining work and actual status. Keep completed cycle documents in place as history. Include the spec and plan with the implementation when committing.

In the final handoff, link the cycle files and summarize behavior changed, verification results, and remaining limitations. A completed implementation does not imply that it was committed.
