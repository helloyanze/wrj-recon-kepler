# Task 1 Latest Output Data Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's built-in Task 1 case data with the latest parseable runs from the workspace `output/` directory while keeping `R10-LONG-TRANSIT-01` as the default case.

**Architecture:** Reuse the existing `scripts/prepare-algorithm-cases.ts` discovery and conversion pipeline. Point it at the workspace-level `output/` tree, write the generated catalog and bundles to `public/data/integration-cases`, and let schema validation exclude runs that cannot be represented as frontend mission bundles. Update only generated data expectations if the existing integration test asserts the old catalog size or timestamps.

**Tech Stack:** TypeScript, Vite, Vitest, Zod-backed case bundle schemas, JSON generated under `public/data/integration-cases`.

---

### Task 1: Generate frontend case data from the latest output

**Files:**
- Modify: `public/data/integration-cases/catalog.json`
- Modify: `public/data/integration-cases/*/bundle.json` for each parseable case discovered from `D:/UserData/Desktop/wrj/output`
- Modify: `tests/mission/r10-integration.test.ts` only if its assertions encode the old case count, run ID, or metrics
- Test: `tests/mission/r10-integration.test.ts`

- [ ] **Step 1: Add or update the focused data expectation before generation**

  Assert that the built-in catalog keeps `R10-LONG-TRANSIT-01` as the default and includes the latest run ID for that case (`20260807T120033`). Add an assertion that the catalog contains the parseable latest cases and does not require infeasible/unparseable cases to be present.

- [ ] **Step 2: Run the focused test and confirm it fails against the old data**

  Run: `npm run test:run -- tests/mission/r10-integration.test.ts`

  Expected: FAIL because the checked-in catalog still reports the previous 20260721 run and old case set.

- [ ] **Step 3: Generate the replacement data**

  Run from `wrj-recon-kepler-demo`:

  ```powershell
  npm run data:prepare-algorithm -- --input-root ..\output --output-root public\data\integration-cases --default-case R10-LONG-TRANSIT-01
  ```

  Expected: the command reports the number of valid generated cases, writes `catalog.json` and one `bundle.json` per selected case, and emits diagnostics only for runs rejected by the existing parser or converter.

- [ ] **Step 4: Verify generated data through the focused test**

  Run: `npm run test:run -- tests/mission/r10-integration.test.ts`

  Expected: PASS with the default case and latest run assertions satisfied.

- [ ] **Step 5: Run the full frontend verification suite**

  Run:

  ```powershell
  npm run typecheck
  npm run lint
  npm run test:run
  npm run build
  npm run data:check-algorithm -- --input-root ..\output --output-root public\data\integration-cases --default-case R10-LONG-TRANSIT-01
  ```

  Expected: all commands exit with code 0; the data check reports no missing, changed, or extra generated files.

- [ ] **Step 6: Review the diff for scope and generated-data integrity**

  Run: `git status --short` and `git diff --stat`

  Confirm that changes are limited to the Task 1 generated data and any directly related test expectation updates; do not alter Task 2 scene data or unrelated source code.
