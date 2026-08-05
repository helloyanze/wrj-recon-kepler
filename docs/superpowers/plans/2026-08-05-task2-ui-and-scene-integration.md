# Task 2 UI and Scene Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Package the nine-scene Task 2 library and rebuild the Task 2 workspace so its left controls reuse Task 1 interaction primitives, its scene selector is grouped, and its right decision panel explains every conclusion with Chinese, data-backed evidence and expandable audit details.

**Architecture:** Normalize upstream catalog v2/v3 at one parsing boundary and keep raw Task 2 contracts separate from Chinese presentation models. Extract only stateless layer-control primitives from Task 1; Task 1 and Task 2 retain their own state and map-layer logic. Generate every displayed decision verdict, reason, metric, comparison, and audit row from decision_trace.v1 and mission_view.v1, never from scene-specific frontend constants.

**Dependency:** Complete docs/superpowers/plans/2026-08-05-task2-scenario-library-expansion.md in the sibling wrj-t2 repository through its export handoff before Task 2 scene packaging in Task 2 below.

**Tech Stack:** React 18, TypeScript, Zod, Vitest, Testing Library, Vite, CSS.

---

## Contract and UI invariants

- Catalog v2 remains readable during migration; normalized application data always has category, dataNature, and featured.
- The committed catalog is v3 and contains exactly nine scenes.
- Category order and labels are fixed: foundation / 基础异常, task_change / 任务变更, event_governance / 事件治理, comprehensive / 综合案例.
- Every scene displays 演示构造输入 · 任务二实际计算 from dataNature = SIMULATED_PIPELINE_RESULT.
- A single layer row may be expanded at a time. Task 2 has no duplicate resource list, task list, or separate legend block in the left sidebar.
- Only change types present in the current scene are shown in the change-color controls.
- Main right-panel text is at least 13px. Audit-only metadata may be 11px.
- Candidate cards always render in this order: 结论, 原因, 方案数据, 对比证据, 审计详情.
- Raw stage IDs, candidate levels, lifecycle values, reason/failure codes, units, and object IDs are localized or formatted before rendering.
- Rejected candidates state the failed constraint and its measured values. Valid but unselected candidates state the first lexicographic metric on which they lose.
- Scene load failures remain isolated to the failed scene entry.

---

### Task 1: Normalize Task 2 catalog v2 and v3

**Files:**
- Modify: src/features/dynamic-replanning/dynamicSceneSchema.ts
- Modify: src/features/dynamic-replanning/loadDynamicScene.ts
- Modify: tests/dynamic/dynamic-scene-schema.test.ts
- Modify: tests/dynamic/load-dynamic-scene.test.ts

- [ ] **Step 1: Add failing schema compatibility tests**

Add one v3 fixture with metadata and one v2 fixture without metadata. Assert both parse to the same normalized type:

~~~ts
expect(parseDynamicSceneCatalog(v3Catalog).scenes[0]).toMatchObject({
  category: "comprehensive",
  dataNature: "SIMULATED_PIPELINE_RESULT",
  featured: true
});

expect(parseDynamicSceneCatalog(v2Catalog).scenes[0]).toMatchObject({
  category: "foundation",
  dataNature: "SIMULATED_PIPELINE_RESULT",
  featured: false
});
~~~

Also retain duplicate scene ID, invalid default ID, and failure-report consistency tests for both versions.

- [ ] **Step 2: Run the focused tests and verify RED**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-scene-schema.test.ts tests/dynamic/load-dynamic-scene.test.ts
~~~

Expected: FAIL because only catalog version 2 is accepted and the normalized metadata does not exist.

- [ ] **Step 3: Implement raw schemas and one normalization function**

In dynamicSceneSchema.ts add:

~~~ts
export const dynamicSceneCategories = [
  "foundation",
  "task_change",
  "event_governance",
  "comprehensive"
] as const;

export const dynamicSceneDataNatures = [
  "SIMULATED_PIPELINE_RESULT"
] as const;
~~~

Keep the current strict scene package fields as the v2 raw entry. Extend them for a strict v3 entry with:

~~~ts
category: z.enum(dynamicSceneCategories),
dataNature: z.enum(dynamicSceneDataNatures),
featured: z.boolean()
~~~

Create separate strict catalog schemas with literal versions 2 and 3. Export parseDynamicSceneCatalog(value: unknown): DynamicSceneCatalog, where DynamicSceneCatalog is the normalized v3-shaped application type. Version 2 entries receive only the fixed migration defaults listed in the invariants; do not infer metadata from scene IDs.

Apply duplicate/default/failure-report validation before normalization or through a shared superRefine helper.

- [ ] **Step 4: Route the loader through the normalization boundary**

Replace the direct dynamicSceneCatalogSchema.parse call in loadDynamicSceneCatalog with parseDynamicSceneCatalog. Do not add version branching to the hook or components.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-scene-schema.test.ts tests/dynamic/load-dynamic-scene.test.ts
npm run typecheck
git add src/features/dynamic-replanning/dynamicSceneSchema.ts src/features/dynamic-replanning/loadDynamicScene.ts tests/dynamic/dynamic-scene-schema.test.ts tests/dynamic/load-dynamic-scene.test.ts
git commit -m "feat: normalize task2 scene catalog metadata"
~~~

---

### Task 2: Preserve catalog v3 metadata and package all nine scenes

**Files:**
- Modify: scripts/prepare-task2-scenes.ts
- Modify: tests/cases/prepare-task2-scenes.test.ts
- Modify: tests/dynamic/committed-scenes.test.ts
- Modify: public/data/task2/catalog.json
- Create or replace: public/data/task2/task-cancelled/**
- Create or replace: public/data/task2/task-priority-raised/**
- Create or replace: public/data/task2/task-dependency-changed/**
- Create or replace: public/data/task2/event-conflict-resolution/**
- Create or replace: public/data/task2/comprehensive-multi-event/**
- Replace from the same export: public/data/task2/resource-lost/**, public/data/task2/low-fuel-return/**, public/data/task2/new-area-task/**, public/data/task2/hard-deadline-fallback/**

- [ ] **Step 1: Add failing preparation tests**

Update the upstream test fixture to version 3 and include metadata. Assert the output catalog:

~~~ts
expect(outputCatalog.version).toBe(3);
expect(outputCatalog.scenes).toHaveLength(9);
expect(outputCatalog.scenes.find(
  scene => scene.sceneId === "comprehensive-multi-event"
)).toMatchObject({
  category: "comprehensive",
  dataNature: "SIMULATED_PIPELINE_RESULT",
  featured: true
});
~~~

Add a negative test showing that a v3 entry missing any presentation field is rejected rather than silently defaulted.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/cases/prepare-task2-scenes.test.ts
~~~

- [ ] **Step 3: Preserve the validated upstream version and fields**

In prepare-task2-scenes.ts:

- parse catalog through the raw v3-aware boundary;
- copy category, dataNature, and featured unchanged;
- emit catalog.version from the validated upstream catalog;
- continue atomic destination replacement, SHA-256 verification, failure report rules, and path-containment checks;
- do not synthesize scene data in this repository.

- [ ] **Step 4: Package the sibling exporter output**

Run after the backend plan has generated output/demo-scenes-v3:

~~~powershell
npm run data:prepare-task2 -- --input "..\wrj-t2\output\demo-scenes-v3"
npm run data:check-task2
~~~

The committed catalog scene IDs must be:

~~~text
resource-lost
low-fuel-return
new-area-task
hard-deadline-fallback
task-cancelled
task-priority-raised
task-dependency-changed
event-conflict-resolution
comprehensive-multi-event
~~~

- [ ] **Step 5: Strengthen committed-scene tests**

Assert all nine scene packages parse, each entry matches its config identity/status, every provenance hash matches the packaged files, and only PARTIAL_SAFE_FALLBACK scenes reference failure_report.json. Assert the comprehensive scene is featured and carries the exact dataNature marker.

- [ ] **Step 6: Verify and commit**

~~~powershell
npm run test:run -- tests/cases/prepare-task2-scenes.test.ts tests/dynamic/committed-scenes.test.ts
npm run data:check-task2
git add scripts/prepare-task2-scenes.ts tests/cases/prepare-task2-scenes.test.ts tests/dynamic/committed-scenes.test.ts public/data/task2
git commit -m "feat: package nine task2 demo scenes"
~~~

---

### Task 3: Extract stateless layer-control primitives from Task 1

**Files:**
- Create: src/components/workspace/LayerControlPrimitives.tsx
- Modify: src/components/workspace/LayerSidebar.tsx
- Modify: tests/mission/mission-sidebar.test.tsx
- Create: tests/workspace/layer-control-primitives.test.tsx

- [ ] **Step 1: Write primitive behavior tests**

Cover:

- header title and collapse action;
- visible toggle label;
- row expansion action;
- color input callback;
- width and opacity callback forwarding;
- optional trailing count/status text.

Use accessible labels, for example:

~~~tsx
aria-label={(visible ? "隐藏 " : "显示 ") + label}
aria-label={"编辑 " + label}
~~~

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/workspace/layer-control-primitives.test.tsx tests/mission/mission-sidebar.test.tsx
~~~

- [ ] **Step 3: Implement the stateless primitives**

Create:

- LayerPanelHeader
- LayerLegendSwatch
- LayerControlRow

LayerControlRow receives all current values and callbacks through props. It must not import Task 1 or Task 2 preference types, Redux, map layers, or scene data.

- [ ] **Step 4: Refactor Task 1 markup without changing behavior**

Replace the matching header, swatch, visibility, expand, color, width, and opacity markup in LayerSidebar.tsx. Preserve its current layer order, state ownership, labels, roster, and preference callbacks.

- [ ] **Step 5: Verify Task 1 regression and commit**

~~~powershell
npm run test:run -- tests/workspace/layer-control-primitives.test.tsx tests/mission/mission-sidebar.test.tsx
npm run typecheck
git add src/components/workspace/LayerControlPrimitives.tsx src/components/workspace/LayerSidebar.tsx tests/workspace/layer-control-primitives.test.tsx tests/mission/mission-sidebar.test.tsx
git commit -m "refactor: share layer control primitives"
~~~

---

### Task 4: Rebuild the Task 2 left sidebar

**Files:**
- Modify: src/components/dynamic/DynamicLayerSidebar.tsx
- Modify: src/components/DynamicReplanningWorkspace.tsx
- Modify: src/features/dynamic-replanning/dynamicLayerPreferences.ts
- Modify: tests/dynamic/dynamic-controls.test.tsx
- Modify: tests/dynamic/dynamic-workspace.test.tsx
- Modify: src/index.css

- [ ] **Step 1: Write failing interaction tests**

Assert:

- title is 图层与航迹;
- only one layer row can be expanded;
- opening a second row closes the first;
- resources and tasks list headings are absent;
- the duplicate legend block is absent;
- the collapse button hides the sidebar and the shell restore control reopens it;
- English change keys are not visible;
- only change types found in the current mission view are listed.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-workspace.test.tsx
~~~

- [ ] **Step 3: Define complete Chinese labels**

Use these labels exactly:

~~~ts
const LAYER_LABELS = {
  taskAreas: "任务区域",
  baselineTrajectories: "原计划航迹",
  activeTrajectories: "当前方案航迹",
  affectedObjects: "受影响对象",
  resourcePositions: "无人机位置",
  eventMarkers: "事件位置"
};

const CHANGE_TYPE_LABELS = {
  baseline: "原计划",
  baseline_flown: "已执行航段",
  baseline_locked: "锁定航段",
  baseline_reused: "沿用航段",
  dynamic_modified: "调整航段",
  dynamic_new: "新增航段",
  dynamic_cancelled: "取消航段"
};
~~~

Map UAV-01 through UAV-04 to 1号无人机 through 4号无人机 at the presentation boundary. For any other UAV-nn identifier, remove the UAV- prefix and leading zeroes, then append 号无人机. Keep the raw ID in title attributes and audit data.

- [ ] **Step 4: Rebuild with shared primitives**

State in DynamicLayerSidebar:

~~~ts
const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
~~~

Clicking the current row closes it; clicking another replaces the expanded ID. Build presentChangeTypes from actual baseline/active segment changeType values and render controls in the fixed semantic order above.

Remove the resource list, task list, separate legend, redundant section titles, raw counts that repeat the timeline, and raw English keys.

- [ ] **Step 5: Wire sidebar collapse through the workspace shell**

Own sidebarCollapsed in DynamicReplanningWorkspace. Pass it to MissionWorkbenchShell and the header callback. Preserve the selected scene and layer preferences across collapse/reopen.

- [ ] **Step 6: Apply readable compact styling**

Reuse Task 1 spacing and control sizes. Do not copy Task 1 business-specific CSS selectors. Ensure color inputs and sliders have visible focus states and the sidebar remains usable at 1366 × 768.

- [ ] **Step 7: Verify and commit**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-workspace.test.tsx tests/mission/mission-sidebar.test.tsx
npm run typecheck
git add src/components/dynamic/DynamicLayerSidebar.tsx src/components/DynamicReplanningWorkspace.tsx src/features/dynamic-replanning/dynamicLayerPreferences.ts tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-workspace.test.tsx src/index.css
git commit -m "feat: simplify task2 layer controls"
~~~

---

### Task 5: Build Chinese, data-backed decision presentation models

**Files:**
- Create: src/features/dynamic-replanning/decisionLabels.ts
- Modify: src/features/dynamic-replanning/decisionPresentation.ts
- Modify: src/features/dynamic-replanning/decisionTraceSchema.ts
- Modify: tests/dynamic/decision-presentation.test.ts
- Modify: tests/fixtures/task2MissionViewFixture.ts

- [ ] **Step 1: Extend the trace fixture and write failing presentation tests**

Update candidate fixtures with facts: [] and add cases for:

- a rejected low-fuel candidate with REQUIRED_FUEL_KG and REMAINING_FUEL_KG;
- a rejected constraint candidate with validation check code and affected IDs;
- two valid candidates where the unselected candidate loses on retainedPlanRatio;
- a selected candidate;
- a fallback candidate;
- event-ingestion facts containing received/effective/conflict counts.

Assert the resulting model contains no raw L1_MINIMAL_ADJUSTMENT, rejected, INSUFFICIENT_REMAINING_FUEL, kg, or raw object ID as user-facing primary text. Assert a candidate with no metrics or facts renders 暂无记录 instead of inventing values. Add a fixture-driven coverage test that collects every stage, lifecycle, level, validation, rejection, failure, selection-reason, fact, unit, and event-audit code in the nine committed traces and requires either an explicit Chinese mapping or the tested unknown-code audit fallback.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/dynamic/decision-presentation.test.ts tests/dynamic/dynamic-scene-schema.test.ts
~~~

- [ ] **Step 3: Accept candidate facts in the frontend contract**

Add one reusable decisionFactSchema and use it for both stage facts and:

~~~ts
facts: z.array(decisionFactSchema).default([])
~~~

The default keeps previously committed v2 traces readable. No other raw trace field is made optional.

- [ ] **Step 4: Add exhaustive label and formatting maps**

decisionLabels.ts owns:

- this exact stage/module mapping: EVENT_INGESTION / 接收并治理动态事件 / T2-M01,T2-M03; SNAPSHOT_AND_IMPACT / 冻结快照并分析影响 / T2-M02,T2-M04; RESOURCE_ASSESSMENT / 评估资源与安全状态 / T2-M05; CANDIDATE_GENERATION / 生成分层候选方案 / T2-M06; PLANNING_AND_VALIDATION / 规划、合并并校验 / T2-M07,T2-M08,T2-M09,T2-M11; RANKING_AND_SELECTION / 排序并选择方案 / T2-M10; PLAN_PUBLICATION / 发布新版本和增量结果 / T2-M12;
- five candidate strategy labels: 最小调整, 单机替换, 备份机接替, 多机协同, 抢占调度;
- lifecycle/status labels;
- known failure, rejection, validation, selection-reason, fact, event-type, event-status, event-audit-reason, unit, object, category, and data-nature labels;
- formatDecisionValue and formatObjectName.

The minimum explicit failure mappings are INSUFFICIENT_REMAINING_FUEL / 剩余油量不足, HARD_DEADLINE_MISSED / 无法满足硬截止时间, and E503_PARTIAL_SAFE_FALLBACK / 完整目标无法满足，已形成安全回退. Extend the map for every additional known code found by the fixture-driven coverage test.

Unknown codes must render as 未识别代码（raw-code） inside audit details, never silently disappear. Main summaries use a safe Chinese fallback such as 未提供可解释原因.

Format EVENT_AUDIT_ENTRY values structurally: main stage data shows the Chinese event type and outcome, while event ID, winningEventId, raw status, and raw reason remain in AuditRow. In event-conflict-resolution this must explain that the geometry change was superseded by the cancellation rather than simply omitting it.

- [ ] **Step 5: Implement pure presentation models**

Export:

~~~ts
interface CandidatePresentation {
  candidateId: string;
  title: string;
  strategy: string;
  verdict: string;
  tone: "accepted" | "rejected" | "candidate" | "fallback";
  reason: string;
  planData: PresentationDatum[];
  evidence: PresentationDatum[];
  comparison: string | null;
  audit: AuditRow[];
}

interface DecisionStagePresentation {
  title: string;
  modules: string[];
  conclusion: string;
  data: PresentationDatum[];
  audit: AuditRow[];
}
~~~

Candidate titles are positional Chinese aliases in generation order: 方案 A, 方案 B, and so on. The raw candidateId is audit-only.

Build planData from metrics and allocations. At minimum include high-priority completion, total completion, retained plan ratio, active/new resource count, finish time, and fuel when present.

For rejected candidates, reason priority is:

1. failed validation check with measured candidate facts;
2. rejection code with measured candidate facts;
3. failure code with measured candidate facts;
4. the Chinese missing-reason fallback.

For valid but unselected candidates, compare against the selected candidate in this exact lexicographic order:

1. highPriorityCompletionRatio descending;
2. totalCompletionRatio descending;
3. retainedPlanRatio descending;
4. newResourceCount ascending;
5. finishTimeSec ascending;
6. totalFuelKg ascending.

Stop at the first unequal metric and produce one sentence containing both values. Do not claim that lower fuel wins if an earlier metric already decides the ranking.

For the selected candidate, compare it with the runner-up using the same order and state the first metric that establishes why it wins. If no runner-up has metrics, use the trace selection reason codes; if neither source exists, show 暂无记录.

- [ ] **Step 6: Verify pure logic and commit**

~~~powershell
npm run test:run -- tests/dynamic/decision-presentation.test.ts tests/dynamic/dynamic-scene-schema.test.ts
npm run typecheck
git add src/features/dynamic-replanning/decisionLabels.ts src/features/dynamic-replanning/decisionPresentation.ts src/features/dynamic-replanning/decisionTraceSchema.ts tests/dynamic/decision-presentation.test.ts tests/fixtures/task2MissionViewFixture.ts
git commit -m "feat: explain task2 decisions in Chinese"
~~~

---

### Task 6: Render the readable decision panel

**Files:**
- Modify: src/components/dynamic/DecisionProcessPanel.tsx
- Create: tests/dynamic/decision-process-panel.test.tsx
- Modify: tests/dynamic/dynamic-workspace.test.tsx
- Modify: src/index.css

- [ ] **Step 1: Write failing DOM-order and localization tests**

For a selected and rejected card, assert DOM order by comparing document positions:

~~~text
结论 < 原因 < 方案数据 < 对比证据 < 审计详情
~~~

Assert summary content is visible without interaction, audit details use a closed details element by default, and expanding it reveals raw IDs/codes. Assert known raw English values are not present outside the audit element.

Add a fallback-scene test to show the safe result conclusion and failure data.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/dynamic/decision-process-panel.test.tsx tests/dynamic/dynamic-workspace.test.tsx
~~~

- [ ] **Step 3: Render stage and candidate presentation models**

DecisionProcessPanel must render:

- current stage name and associated module names;
- stage input/data, computed conclusion, and affected-object summary;
- all candidate cards, including rejected candidates;
- every conclusion at the top of its card, with planData present later in the fixed five-part card order;
- reason and comparison evidence with explicit Chinese labels;
- a native details/summary audit block, closed by default;
- selection/publication conclusion and partial-safe-fallback status when present.

Do not select explanatory text by scene ID.

- [ ] **Step 4: Increase width and typography**

Set the right panel to a fluid width with approximately 420px desktop maximum and 380px practical minimum. Main text, values, buttons, and summary labels are at least 13px; stage/candidate headings are 14–16px; only audit metadata may be 11px. Add clear spacing between conclusion, data grid, comparison, and details.

At narrower widths preserve map usability through the existing shell layout; do not hide the conclusion or candidate data.

- [ ] **Step 5: Verify and commit**

~~~powershell
npm run test:run -- tests/dynamic/decision-process-panel.test.tsx tests/dynamic/dynamic-workspace.test.tsx
npm run typecheck
git add src/components/dynamic/DecisionProcessPanel.tsx tests/dynamic/decision-process-panel.test.tsx tests/dynamic/dynamic-workspace.test.tsx src/index.css
git commit -m "feat: render auditable task2 decision panel"
~~~

---

### Task 7: Group the nine-scene selector and show data nature

**Files:**
- Modify: src/components/DynamicReplanningWorkspace.tsx
- Modify: tests/dynamic/dynamic-workspace.test.tsx
- Modify: tests/dynamic/use-dynamic-scene-library.test.tsx
- Modify: src/index.css

- [ ] **Step 1: Write failing grouped-selector tests**

Assert the select contains optgroup labels in the fixed category order and that each of the nine scenes appears exactly once. Assert the comprehensive scene is marked 贯穿案例 in its visible option text and the selected scene displays 演示构造输入 · 任务二实际计算.

Retain a test where one scene fetch fails: only its option is disabled, another scene loads and remains selectable, and its group remains present.

- [ ] **Step 2: Run and verify RED**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-workspace.test.tsx tests/dynamic/use-dynamic-scene-library.test.tsx
~~~

- [ ] **Step 3: Render metadata-driven groups**

Group entries by category metadata, not by ID or array slicing. Within a group preserve catalog order. Append （贯穿案例） only when featured is true. Render the data-nature badge near the current scene summary using the centralized label map.

Disabled scene options retain their scene-specific error in accessible supporting text. Do not make a single bad package fail the whole library.

- [ ] **Step 4: Verify and commit**

~~~powershell
npm run test:run -- tests/dynamic/dynamic-workspace.test.tsx tests/dynamic/use-dynamic-scene-library.test.tsx
npm run typecheck
git add src/components/DynamicReplanningWorkspace.tsx tests/dynamic/dynamic-workspace.test.tsx tests/dynamic/use-dynamic-scene-library.test.tsx src/index.css
git commit -m "feat: organize task2 scene library"
~~~

---

### Task 8: Full verification and visual QA

**Files:**
- Modify only if verification exposes a defect in the files already listed above.

- [ ] **Step 1: Scan for forbidden raw UI text**

~~~powershell
rg -n "L[1-5]_|EVENT_INGESTION|SNAPSHOT_AND_IMPACT|RESOURCE_ASSESSMENT|CANDIDATE_GENERATION|PLANNING_AND_VALIDATION|RANKING_AND_SELECTION|PLAN_PUBLICATION|generated|rejected|selected|fallback" src/components src/features/dynamic-replanning
~~~

Review every match. Raw values may exist in schemas and mapping keys, but must not be directly interpolated into primary UI text.

- [ ] **Step 2: Run the complete automated verification**

Before the full suite, extend tests/dynamic/dynamic-playback.test.ts and tests/dynamic/dynamic-workspace.test.tsx to iterate over the nine committed scene packages. For every scene, assert play, pause, seek, step-forward, and replay keep a valid phase/time state and do not throw. Run those tests directly once, then run the full suite.

~~~powershell
npm run test:run -- tests/dynamic/dynamic-playback.test.ts tests/dynamic/dynamic-workspace.test.tsx
npm run data:check-task2
npm run test:run
npm run typecheck
npm run lint
npm run build
~~~

All commands must exit 0. Record the test count and build result in the implementation handoff.

- [ ] **Step 3: Run local visual QA at two viewport sizes**

Start the existing development command:

~~~powershell
npm run dev
~~~

Inspect Task 2 at 1920 × 1080 and 1366 × 768:

- open each category and switch through all nine scenes;
- confirm only one layer editor expands at a time;
- collapse/reopen the left sidebar;
- verify present-only change colors;
- inspect one accepted, rejected, unselected-valid, and fallback candidate;
- confirm conclusions and plan data are visible without expanding audit;
- expand audit and confirm raw IDs/codes remain available;
- confirm no overlap, clipped controls, unreadably small text, or horizontal page scroll.

Capture screenshots for one foundation scene, event-conflict-resolution, and comprehensive-multi-event. Store them outside public assets unless the repository already has a documented visual-regression location.

- [ ] **Step 4: Re-run affected checks after visual fixes**

Any visual fix requires rerunning its focused test, npm run typecheck, npm run lint, and npm run build.

- [ ] **Step 5: Commit final verified adjustments**

~~~powershell
git status --short
git diff --check
git add src tests public/data/task2 scripts
git commit -m "fix: finalize task2 workspace presentation"
~~~

Skip the final commit if Step 3 required no changes. Do not include screenshots, temporary logs, or unrelated user files.

---

## Completion evidence

Before declaring completion, provide:

- wrj-t2 export command and successful nine-scene assertion result;
- frontend catalog check, full test, typecheck, lint, and build outputs;
- the nine scene IDs and their four category groups;
- confirmation that the document-derived comprehensive case is labeled as simulated input with actual Task 2 computed output;
- confirmation that rejected and unselected-valid candidates both show data-backed reasons;
- visual QA viewport sizes and screenshot paths;
- final git status for both repositories, explicitly identifying any pre-existing unrelated changes.
