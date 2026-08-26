# Agent 2 task: ordering, status, admin, and client API flows

You are a Codex worker reporting to the Orchestrator. Complete only the assigned
subtask. Obey all repository instructions. Preserve user changes. Do not reset,
clean, commit, merge, push, or edit outside the allowed scope. Run the listed
verification. Record concise findings, files changed, tests run, failures, and
remaining risks at the requested result path. Do not wait for other workers
unless the brief names a dependency. Do not delegate, invoke subagents, or launch
another Codex process.

## Objective

Perform a defect-first, read-only review of transactional client flows in the
current repository snapshot. Find every concrete, actionable correctness,
security, performance, or maintainability bug that a maintainer would likely fix.
The user requested a full repository audit, so assess the current snapshot rather
than requiring a branch diff.

## Allowed scope

- Read: `src/pages/OrderPage.jsx`, `src/pages/StatusPage.jsx`,
  `src/pages/AdminPage.jsx`, `src/components/OrderStatusCard.jsx`,
  `src/components/ReportsPanel.jsx`, `src/hooks/useTakedownRequests.js`,
  `src/utils/api.js`, `src/utils/orders.js`, `src/utils/slices.js`, their tests,
  direct API call sites needed to validate contracts, and repository instructions.
- Do not modify source or tests. The only permitted write is the result report.
- Focus on order submission, validation, polling/status, authentication/admin,
  moderation/reporting, stale state and race conditions, error/retry behavior,
  response-shape mismatches, and user-visible failure paths.

## Verification

- Inspect every in-scope path plus relevant tests and server contracts.
- Run focused Vitest files if they can run without external services or
  credentials. Do not request approval or weaken the sandbox if they cannot.
- Demonstrate each finding from an actual code path; exclude style nits,
  speculation, intentional behavior, and duplicates.

## Result format

Write `/Users/pmorganelli/petermorganelli/peters-pizzeria-site/.codex-orchestration/pizzeria-review-0826/agent-2-result.md`.
List findings first, ordered by severity, one per issue:

`[P1] Imperative finding title — path/to/file.jsx:line`

Follow with one short paragraph explaining the triggering scenario and why it is
wrong. Use P0/P1/P2/P3 as critical/urgent/ordinary/low-impact. If none qualify,
write `No findings.` Then add a brief overall assessment, tests run or failures,
files changed (`None`), and residual risks.
