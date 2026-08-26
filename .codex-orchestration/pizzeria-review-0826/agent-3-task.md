# Agent 3 task: public UI, routing, media, and accessibility

You are a Codex worker reporting to the Orchestrator. Complete only the assigned
subtask. Obey all repository instructions. Preserve user changes. Do not reset,
clean, commit, merge, push, or edit outside the allowed scope. Run the listed
verification. Record concise findings, files changed, tests run, failures, and
remaining risks at the requested result path. Do not wait for other workers
unless the brief names a dependency. Do not delegate, invoke subagents, or launch
another Codex process.

## Objective

Perform a defect-first, read-only review of the current repository snapshot's
public UI, routing, media, accessibility, and browser lifecycle behavior. Find
every concrete, actionable correctness, performance, accessibility, or
maintainability bug that a maintainer would likely fix. The user requested a full
repository audit, so assess the current snapshot rather than requiring a diff.

## Allowed scope

- Read: `src/App.jsx`, `src/main.jsx`, all public-facing pages except
  `OrderPage.jsx`, `StatusPage.jsx`, and `AdminPage.jsx`; `src/components/Nav.jsx`,
  `Footer.jsx`, `LogoBadge.jsx`, `Lightbox.jsx`, `LineReveal.jsx`,
  `ErrorBoundary.jsx`; `src/hooks/useBoardTitle.js`, `useScrolled.js`,
  `useScrollReveal.js`; `src/utils/routes.js`, `photos.js`, `chunkReload.js`;
  `src/data/**`; `src/index.css`; their tests; and repository instructions.
- Do not modify source or tests. The only permitted write is the result report.
- Focus on route/deep-link behavior, navigation, document metadata, keyboard and
  screen-reader interaction, event/listener cleanup, animation lifecycle, image
  fallbacks/layout, browser compatibility, and rendering edge cases.

## Verification

- Inspect every in-scope path and relevant tests/call sites.
- Run focused Vitest files if they can run without external services or
  credentials. Do not request approval or weaken the sandbox if they cannot.
- Demonstrate each finding from an actual code path; exclude style nits,
  speculation, intentional behavior, and duplicates.

## Result format

Write `/Users/pmorganelli/petermorganelli/peters-pizzeria-site/.codex-orchestration/pizzeria-review-0826/agent-3-result.md`.
List findings first, ordered by severity, one per issue:

`[P1] Imperative finding title — path/to/file.jsx:line`

Follow with one short paragraph explaining the triggering scenario and why it is
wrong. Use P0/P1/P2/P3 as critical/urgent/ordinary/low-impact. If none qualify,
write `No findings.` Then add a brief overall assessment, tests run or failures,
files changed (`None`), and residual risks.
