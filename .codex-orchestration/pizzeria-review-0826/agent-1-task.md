# Agent 1 task: backend APIs, authentication, and persistence

You are a Codex worker reporting to the Orchestrator. Complete only the assigned
subtask. Obey all repository instructions. Preserve user changes. Do not reset,
clean, commit, merge, push, or edit outside the allowed scope. Run the listed
verification. Record concise findings, files changed, tests run, failures, and
remaining risks at the requested result path. Do not wait for other workers
unless the brief names a dependency. Do not delegate, invoke subagents, or launch
another Codex process.

## Objective

Perform a defect-first, read-only review of the current repository snapshot's
server-side API, authentication, persistence, and data-integrity paths. Find every
concrete, actionable correctness, security, performance, or maintainability bug
that a maintainer would likely fix. The user requested a full repository audit,
so assess the current snapshot rather than requiring a branch diff.

## Allowed scope

- Read: `api/**/*.js`, `scripts/dev-api.mjs`, their tests and fixtures, `README.md`,
  `SECURITY.md`, `TESTING.md`, `vercel.json`, `package.json`, and repository
  instructions.
- Do not modify source or tests. The only permitted write is the result report.
- Review integrations among `login`, `orders`, `reports`, `nights`, `slices`, and
  the `_lib` modules, including concurrency, validation, authorization, method and
  error handling, storage semantics, environment behavior, and Vercel/runtime
  compatibility.

## Verification

- Inspect all files in scope and their call sites/tests.
- Run the relevant API unit tests if they can run without external services or
  credentials. Do not request approval or weaken the sandbox if they cannot.
- Demonstrate each finding from an actual code path; exclude style nits,
  speculation, intentional behavior, and duplicates.

## Result format

Write `/Users/pmorganelli/petermorganelli/peters-pizzeria-site/.codex-orchestration/pizzeria-review-0826/agent-1-result.md`.
List findings first, ordered by severity, one per issue:

`[P1] Imperative finding title — path/to/file.js:line`

Follow with one short paragraph explaining the triggering scenario and why it is
wrong. Use P0/P1/P2/P3 as critical/urgent/ordinary/low-impact. If none qualify,
write `No findings.` Then add a brief overall assessment, tests run or failures,
files changed (`None`), and residual risks.
