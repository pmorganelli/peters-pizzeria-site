# Agent 4 task: build, deployment, SEO, tests, and integration contracts

You are a Codex worker reporting to the Orchestrator. Complete only the assigned
subtask. Obey all repository instructions. Preserve user changes. Do not reset,
clean, commit, merge, push, or edit outside the allowed scope. Run the listed
verification. Record concise findings, files changed, tests run, failures, and
remaining risks at the requested result path. Do not wait for other workers
unless the brief names a dependency. Do not delegate, invoke subagents, or launch
another Codex process.

## Objective

Perform a defect-first, read-only review of cross-cutting build, deployment, SEO,
test, and frontend/backend integration contracts in the current repository
snapshot. Find every concrete, actionable correctness, security, performance, or
maintainability bug that a maintainer would likely fix. The user requested a full
repository audit, so assess the current snapshot rather than requiring a diff.

## Allowed scope

- Read: `package.json`, lockfile, Vite/Vitest/ESLint/PostCSS/Tailwind/Vercel
  configuration, `index.html`, `public/**`, `scripts/gen-*`, all test files and
  test helpers, `README.md`, `SECURITY.md`, `TESTING.md`, repository instructions,
  and any application/API code needed to prove an integration-contract defect.
- Do not modify source or tests. The only permitted write is the result report.
- Own full-suite validation and cross-boundary mismatches not wholly owned by a
  single UI or API worker. Review build-time side effects, deploy routing,
  sitemap/canonical metadata, environment assumptions, dependency/runtime
  compatibility, missing high-value tests, and production/test divergence.

## Verification

- Run `npm test`, `npm run lint`, and `npm run build` if they can run without
  network access, external services, or credentials. Do not request approval or
  weaken the sandbox if they cannot. Record exact outcomes.
- Inspect failures and prove actual defects from code paths. A test gap alone is
  not a finding unless tied to a concrete bug.
- Exclude style nits, speculation, intentional behavior, and duplicates.

## Result format

Write `/Users/pmorganelli/petermorganelli/peters-pizzeria-site/.codex-orchestration/pizzeria-review-0826/agent-4-result.md`.
List findings first, ordered by severity, one per issue:

`[P1] Imperative finding title — path/to/file.js:line`

Follow with one short paragraph explaining the triggering scenario and why it is
wrong. Use P0/P1/P2/P3 as critical/urgent/ordinary/low-impact. If none qualify,
write `No findings.` Then add a brief overall assessment, tests run or failures,
files changed (`None`), and residual risks.
