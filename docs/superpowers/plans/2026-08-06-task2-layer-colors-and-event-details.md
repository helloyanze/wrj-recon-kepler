# Task 2 Layer Colors and Event Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render auditable task-region evolution, independently editable task/baseline/current-route colors, and detailed per-event governance explanations for all nine Task 2 scenes.

**Architecture:** Parse geometry-diff and raw-event artifacts at the scene-loading boundary, then build pure display models for map layers and event governance. Keep task colors, baseline-route color, change-type colors, and UAV colors in separate preference fields so switching the current-route color mode cannot recolor unrelated layers. Join raw events to `EVENT_AUDIT_ENTRY` by event ID and format event-specific payloads into Chinese summaries while keeping raw codes and coordinates in closed audit details.

**Tech Stack:** React 18, TypeScript 5.6, Zod, deck.gl 8.9, Vitest, Testing Library, Vite.

**Dependency:** Complete `wrj-t2/docs/superpowers/plans/2026-08-06-task2-geometry-diff-export.md` and produce `output/demo-scenes-v4` before packaging updated scene assets in Task 9.

---

## File Structure

- Create: `src/features/dynamic-replanning/dynamicEventSchema.ts` - strict `dynamic_events.json` parser.
- Create: `src/features/dynamic-replanning/taskGeometrySchema.ts` - dependency-free Polygon/LineString wire schema.
- Create: `src/features/dynamic-replanning/taskGeometryDiffSchema.ts` - optional geometry audit parser.
- Modify: `src/features/dynamic-replanning/missionViewSchema.ts` - optional per-task geometry context.
- Modify: `src/features/dynamic-replanning/dynamicSceneSchema.ts` - loaded package types.
- Modify: `src/features/dynamic-replanning/loadDynamicScene.ts` - fetch/hash/validate event and geometry artifacts.
- Modify: `src/features/dynamic-replanning/buildDynamicScene.ts` - map-ready original/current/extension geometry and raw events.
- Modify: `src/features/dynamic-replanning/dynamicLayerPreferences.ts` - independent color preferences and legacy migration.
- Modify: `src/features/dynamic-replanning/dynamicDeckLayers.ts` - task colors, extension overlay, baseline color, current-route modes.
- Modify: `src/components/dynamic/DynamicLayerSidebar.tsx` - controls for each independent color family.
- Create: `src/features/dynamic-replanning/eventIngestionPresentation.ts` - event/audit join and Chinese event details.
- Modify: `src/components/dynamic/DecisionProcessPanel.tsx` - detailed event summary and cards.
- Modify: `src/index.css` - compact event cards and extension legend styling.
- Modify: `scripts/prepare-task2-scenes.ts` - include geometry-diff artifact in validated packaging.
- Modify corresponding files under `tests/dynamic`, `tests/cases`, and `tests/fixtures`.

### Task 1: Parse Raw Events and Geometry Context

**Files:**
- Create: `src/features/dynamic-replanning/taskGeometrySchema.ts`
- Create: `src/features/dynamic-replanning/dynamicEventSchema.ts`
- Create: `src/features/dynamic-replanning/taskGeometryDiffSchema.ts`
- Modify: `src/features/dynamic-replanning/missionViewSchema.ts`
- Modify: `tests/dynamic/dynamic-scene-schema.test.ts`
- Modify: `tests/fixtures/task2MissionViewFixture.ts`

- [ ] **Step 1: Add failing schema tests**

```ts
import {dynamicEventBatchSchema} from "../../src/features/dynamic-replanning/dynamicEventSchema";
import {taskGeometryDiffV1Schema} from "../../src/features/dynamic-replanning/taskGeometryDiffSchema";

it("parses event-specific payloads", () => {
  const batch = dynamicEventBatchSchema.parse(dynamicEventsFixture);
  expect(batch.events[0].payload.kind).toBe("RESOURCE_LOW_FUEL");
});

it("parses task geometry evolution and overlap separately", () => {
  const document = taskGeometryDiffV1Schema.parse(taskGeometryDiffFixture);
  expect(document.entries[0].relation).toBe("expanded");
  expect(document.entries[1].spatialRelation).toBe("overlap");
  expect(document.entries[1].relation).not.toBe("expanded");
});

it("keeps old mission views readable without geometryContext", () => {
  const oldTask = {...missionViewFixture.tasks[0]};
  delete (oldTask as {geometryContext?: unknown}).geometryContext;
  expect(missionViewV1Schema.parse({
    ...missionViewFixture,
    tasks: [oldTask]
  }).tasks[0].geometryContext).toBeNull();
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/dynamic-scene-schema.test.ts
```

Expected: FAIL because the schemas and fixture fields do not exist.

- [ ] **Step 3: Extract the shared geometry schema**

Move the existing `geometryPointSchema`, `polygonGeometrySchema`, `lineStringGeometrySchema`, and exported `taskGeometrySchema` from `missionViewSchema.ts` into `taskGeometrySchema.ts` without changing validation behavior:

```ts
import {z} from "zod";

const finiteNumber = z.number().finite();
const geometryPointSchema = z.union([
  z.tuple([finiteNumber, finiteNumber]),
  z.tuple([finiteNumber, finiteNumber, finiteNumber])
]);

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(
    z.array(geometryPointSchema).min(4).refine(
      ring => JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
      "polygon exterior ring must be closed"
    )
  ).min(1)
}).strict();

const lineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(geometryPointSchema).min(1)
}).strict();

export const taskGeometrySchema = z.discriminatedUnion("type", [
  polygonGeometrySchema,
  lineStringGeometrySchema
]);
export type TaskGeometry = z.infer<typeof taskGeometrySchema>;
```

Import it into `missionViewSchema.ts`. This prevents a cycle when mission-view tasks later import `taskGeometryContextSchema`.

- [ ] **Step 4: Implement the event schema**

Create `dynamicEventSchema.ts`:

```ts
import {z} from "zod";
import {taskGeometrySchema} from "./taskGeometrySchema";

const id = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();
const emptyPayload = z.object({kind: z.literal("EMPTY")}).strict();
const payloadSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("GEOMETRY_CHANGED"), geometry: taskGeometrySchema}).strict(),
  z.object({kind: z.literal("PRIORITY_CHANGED"), priority: z.number().int().nonnegative()}).strict(),
  z.object({kind: z.literal("EARLIEST_START_CHANGED"), earliestStartTimeSec: nonNegative}).strict(),
  z.object({kind: z.literal("LATEST_FINISH_CHANGED"), latestFinishTimeSec: nonNegative}).strict(),
  z.object({kind: z.literal("DEADLINE_TYPE_CHANGED"), deadlineType: id}).strict(),
  z.object({
    kind: z.literal("DEPENDENCY_CHANGED"),
    predecessorTaskIds: z.array(id),
    successorTaskIds: z.array(id)
  }).strict(),
  z.object({kind: z.literal("RESOURCE_LOW_FUEL"), remainingFuelKg: nonNegative.nullable()}).strict(),
  z.object({kind: z.literal("RESOURCE_DEGRADED"), unavailableCapabilities: z.array(id)}).strict(),
  z.object({kind: z.literal("RESOURCE_DELAYED"), availableAfterTimeSec: nonNegative}).strict(),
  z.object({
    kind: z.literal("RESOURCE_TIME_CONFLICT"),
    conflictStartTimeSec: nonNegative,
    conflictFinishTimeSec: nonNegative
  }).strict(),
  z.object({
    kind: z.literal("NEW_TASK"),
    task: z.object({
      taskId: id,
      taskType: id,
      status: id,
      priority: z.number().int().nonnegative(),
      geometry: taskGeometrySchema,
      minimumCoverageRatio: z.number().min(0).max(1),
      earliestStartTimeSec: nonNegative.nullable(),
      latestFinishTimeSec: nonNegative.nullable(),
      predecessorTaskIds: z.array(id),
      successorTaskIds: z.array(id),
      metadata: z.record(z.unknown())
    }).passthrough()
  }).strict(),
  emptyPayload
]);

export const dynamicEventBatchSchema = z.object({
  batchId: id,
  missionId: id,
  sourcePlanVersion: z.number().int().positive(),
  snapshotId: id,
  missionTimeSec: nonNegative,
  events: z.array(z.object({
    eventId: id,
    eventType: id,
    eventTimeSec: nonNegative,
    affectedObjectId: id,
    priority: z.number().int().nonnegative(),
    payload: payloadSchema,
    status: id,
    idempotencyKey: z.string().nullable(),
    normalizedPayloadHash: z.string().nullable()
  }).strict())
}).strict();

export type DynamicEventBatch = z.infer<typeof dynamicEventBatchSchema>;
export type DynamicEvent = DynamicEventBatch["events"][number];
```

- [ ] **Step 5: Implement geometry-context schemas**

Create `taskGeometryDiffSchema.ts`:

```ts
import {z} from "zod";
import {taskGeometrySchema} from "./taskGeometrySchema";

const id = z.string().min(1);
const nonNegative = z.number().finite().nonnegative();
export const overlayGeometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()).min(1)
}).strict();

export const taskGeometryContextSchema = z.object({
  originalGeometry: taskGeometrySchema.nullable(),
  currentGeometry: taskGeometrySchema.nullable(),
  relation: z.enum(["unchanged", "expanded", "reduced", "replaced", "new", "unknown"]),
  spatialRelation: z.enum(["disjoint", "overlap"]),
  overlappingTaskIds: z.array(id),
  extensionGeometry: overlayGeometrySchema.nullable(),
  originalAreaM2: nonNegative.nullable(),
  currentAreaM2: nonNegative.nullable(),
  extensionAreaM2: nonNegative,
  extensionRatio: nonNegative
}).strict();

export const taskGeometryDiffV1Schema = z.object({
  schemaVersion: z.literal("task_geometry_diff.v1"),
  missionId: id,
  sourcePlanVersion: z.number().int().positive(),
  planVersion: z.number().int().positive(),
  methodVersion: z.literal("shapely-difference-v1"),
  entries: z.array(taskGeometryContextSchema.extend({
    taskId: id,
    originalGeometryHash: z.string().nullable(),
    currentGeometryHash: z.string().nullable()
  }).strict())
}).strict();

export type TaskGeometryContext = z.infer<typeof taskGeometryContextSchema>;
export type TaskGeometryDiffV1 = z.infer<typeof taskGeometryDiffV1Schema>;
```

Add `geometryContext: taskGeometryContextSchema.nullable().optional().transform(value => value ?? null)` to `missionViewTaskSchema`.

- [ ] **Step 6: Run schema tests and typecheck**

```powershell
npm run test:run -- tests/dynamic/dynamic-scene-schema.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/dynamic-replanning/taskGeometrySchema.ts src/features/dynamic-replanning/dynamicEventSchema.ts src/features/dynamic-replanning/taskGeometryDiffSchema.ts src/features/dynamic-replanning/missionViewSchema.ts tests/dynamic/dynamic-scene-schema.test.ts tests/fixtures/task2MissionViewFixture.ts
git commit -m "feat: parse task2 events and geometry context"
```

### Task 2: Load and Cross-Validate Scene Artifacts

**Files:**
- Modify: `src/features/dynamic-replanning/dynamicSceneSchema.ts`
- Modify: `src/features/dynamic-replanning/loadDynamicScene.ts`
- Modify: `tests/dynamic/load-dynamic-scene.test.ts`
- Modify: `tests/dynamic/committed-scenes.test.ts`
- Modify: `tests/fixtures/task2MissionViewFixture.ts`
- Modify: `tests/dynamic/build-dynamic-scene.test.ts`
- Modify: `tests/dynamic/decision-process-panel.test.tsx`
- Modify: `tests/dynamic/decision-presentation.test.ts`
- Modify: `tests/dynamic/dynamic-controls.test.tsx`
- Modify: `tests/dynamic/dynamic-detail-drawer.test.tsx`
- Modify: `tests/dynamic/dynamic-interpolation.test.ts`
- Modify: `tests/dynamic/dynamic-map-overlay.test.tsx`
- Modify: `tests/dynamic/dynamic-playback.test.ts`
- Modify: `tests/dynamic/dynamic-scene-map-state.test.ts`
- Modify: `tests/dynamic/dynamic-workspace.test.tsx`
- Modify: `tests/dynamic/use-dynamic-playback.test.tsx`

- [ ] **Step 1: Write failing loader tests**

Extend the test package builder with `dynamic_events.json` and `task_geometry_diff.v1.json`, then assert:

```ts
const loaded = await loadDynamicScene("/data", entry, fetcher);
expect(loaded.dynamicEvents.events).toHaveLength(1);
expect(loaded.geometryDiff?.entries[0].taskId).toBe("TASK-001");

it("rejects an event batch that differs from the decision trace", async () => {
  files["dynamic_events.json"] = JSON.stringify({
    ...dynamicEventsFixture,
    batchId: "OTHER-BATCH"
  });
  await expect(load()).rejects.toThrow("event batch identity");
});

it("allows old packages without a geometry diff file", async () => {
  delete files["task_geometry_diff.v1.json"];
  delete provenance.packagedSha256["task_geometry_diff.v1.json"];
  await expect(load()).resolves.toMatchObject({geometryDiff: null});
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/load-dynamic-scene.test.ts tests/dynamic/committed-scenes.test.ts
```

Expected: FAIL because the loader currently ignores both files.

- [ ] **Step 3: Extend loaded-package types**

In `dynamicSceneSchema.ts`:

```ts
export interface LoadedDynamicScenePackage {
  config: SceneConfig;
  baseline: CaseBundleV2;
  view: MissionViewV1;
  dynamicEvents: DynamicEventBatch;
  geometryDiff: TaskGeometryDiffV1 | null;
  decisionTrace: DecisionTraceV1;
  failureReport: FailureReport | null;
  provenance: SceneProvenance;
}
```

- [ ] **Step 4: Fetch and validate both files**

Add `dynamic_events.json` to the required list. Treat `task_geometry_diff.v1.json` as optional only when absent from `packagedSha256`; when listed, fetch it and reject missing/hash-invalid content.

After parsing, enforce:

```ts
if (
  dynamicEvents.batchId !== decisionTrace.eventBatchId ||
  dynamicEvents.missionId !== decisionTrace.missionId ||
  dynamicEvents.sourcePlanVersion !== decisionTrace.sourcePlanVersion
) throw new Error(`${entry.sceneId}: dynamic event batch identity is inconsistent`);

if (geometryDiff !== null && (
  geometryDiff.missionId !== view.mission.missionId ||
  geometryDiff.sourcePlanVersion !== view.activePlan.sourcePlanVersion ||
  geometryDiff.planVersion !== view.activePlan.planVersion
)) throw new Error(`${entry.sceneId}: geometry diff identity is inconsistent`);
```

Return both parsed values.

Add parsed `dynamicEventsFixture` and `taskGeometryDiffFixture` fields to every `LoadedDynamicScenePackage` literal in the test files listed above. Do not make the production fields optional merely to avoid updating fixtures.

- [ ] **Step 5: Update committed-scene expectations**

Require `dynamic_events.json` for all scenes. Require `task_geometry_diff.v1.json` only after Task 9 packages the v4 export. Verify every listed hash against file bytes.

- [ ] **Step 6: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/load-dynamic-scene.test.ts tests/dynamic/committed-scenes.test.ts
npm run typecheck
git add src/features/dynamic-replanning/dynamicSceneSchema.ts src/features/dynamic-replanning/loadDynamicScene.ts tests/dynamic/load-dynamic-scene.test.ts tests/dynamic/committed-scenes.test.ts
git commit -m "feat: load task2 event and geometry artifacts"
```

### Task 3: Build Map-Ready Geometry and Event Data

**Files:**
- Modify: `src/features/dynamic-replanning/buildDynamicScene.ts`
- Modify: `tests/dynamic/build-dynamic-scene.test.ts`

- [ ] **Step 1: Write failing scene-model tests**

```ts
expect(scene.rawEvents).toEqual(scenePackage.dynamicEvents.events);
expect(scene.taskPolygons.find(task => task.taskId === "T-A")).toMatchObject({
  relation: "expanded",
  overlappingTaskIds: ["T-B"]
});
expect(scene.taskExtensions).toHaveLength(1);
expect(scene.taskExtensions[0]).toMatchObject({taskId: "T-A"});
```

Add a legacy fixture with no geometry diff and assert `taskExtensions` is empty.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/build-dynamic-scene.test.ts
```

Expected: FAIL because the scene exposes only mission-view timeline events and current polygons.

- [ ] **Step 3: Extend scene types**

```ts
export interface DynamicTaskPolygon {
  taskId: string;
  status: MissionViewV1["tasks"][number]["status"];
  changeType: ChangeType;
  relation: TaskGeometryContext["relation"];
  spatialRelation: TaskGeometryContext["spatialRelation"];
  overlappingTaskIds: string[];
  originalPolygon: MapPoint[] | null;
  currentPolygon: MapPoint[];
}

export interface DynamicTaskExtension {
  extensionId: string;
  taskId: string;
  polygon: MapPoint[][];
  extensionAreaM2: number;
  extensionRatio: number;
}

export interface DynamicScene {
  // existing fields
  rawEvents: DynamicEvent[];
  geometryDiff: TaskGeometryDiffV1 | null;
  taskExtensions: DynamicTaskExtension[];
}
```

Create focused helpers that normalize Polygon/MultiPolygon coordinates into polygon/ring arrays, flatten a MultiPolygon into one `DynamicTaskExtension` datum per polygon, and transform every local coordinate with `localToMapPoint`. Use `geometryContext.originalGeometry` for `originalPolygon` and the task's current `geometry` for `currentPolygon`; legacy tasks have `originalPolygon: null`.

- [ ] **Step 4: Enforce event identity closure**

In `assertPackageConsistency`, require every raw event ID to have an `EVENT_AUDIT_ENTRY` fact and every audit event ID to exist in the raw batch. Use `fact.objectIds[0]` as the event ID. Reject duplicate event IDs. Compare `RECEIVED_EVENT_COUNT` with the raw event length and compare the effective/duplicate/overridden facts with the audit statuses; reject inconsistent scene packages before rendering.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/build-dynamic-scene.test.ts
npm run typecheck
git add src/features/dynamic-replanning/buildDynamicScene.ts tests/dynamic/build-dynamic-scene.test.ts
git commit -m "feat: build task2 geometry and event scene data"
```

### Task 4: Separate Task, Baseline, Change, and UAV Color Preferences

**Files:**
- Modify: `src/features/dynamic-replanning/dynamicLayerPreferences.ts`
- Modify: `tests/dynamic/dynamic-layer-preferences.test.ts`

- [ ] **Step 1: Write failing preference and migration tests**

```ts
const defaults = createDefaultDynamicLayerPreferences(
  "scene-1",
  ["UAV-01", "UAV-02"],
  ["T-A", "T-B"]
);
expect(Object.keys(defaults.taskColors)).toEqual(["T-A", "T-B"]);
expect(defaults.baselineRouteColor).not.toBe(defaults.changeColors.baseline_flown);
expect(defaults.taskExtensionColor).not.toBe(defaults.taskColors["T-A"]);

localStorage.setItem("wrj-dynamic-layer-preferences:v1:scene-1", JSON.stringify({
  ...legacyPreferences,
  changeColors: {...legacyPreferences.changeColors, baseline: "#112233"}
}));
const migrated = loadDynamicLayerPreferences(
  "scene-1",
  ["UAV-01"],
  ["T-A"]
);
expect(migrated.baselineRouteColor).toBe("#112233");
expect(migrated.taskColors["T-A"]).toMatch(/^#[0-9A-F]{6}$/u);
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/dynamic-layer-preferences.test.ts
```

Expected: FAIL because task colors and baseline-route color do not exist.

- [ ] **Step 3: Extend the existing version-1 stored shape compatibly**

Add fields:

```ts
export interface DynamicLayerPreferencesV1 {
  version: 1;
  sceneId: string;
  colorMode: DynamicColorMode;
  layers: Record<DynamicLayerId, MissionLayerPreference>;
  taskColors: Record<string, string>;
  taskExtensionColor: string;
  baselineRouteColor: string;
  changeColors: Record<string, string>;
  resourceColors: Record<string, string>;
  markerSize: number;
}
```

Change all create/load call sites to pass `taskIds`. Use stable task defaults such as `#36A2AE`, `#D6A13D`, `#B26BC5`, and `#5C8FD6`; set `taskExtensionColor` to `#F2C94C`, `baselineRouteColor` to `#718096`, and `baseline_flown` to `#B8C2CC`. Preserve stored `changeColors.baseline` as the migration source for `baselineRouteColor` when the new field is absent.

Validate every restored color with the existing `HEX_COLOR` rule and generate defaults for newly appearing task/UAV IDs.

- [ ] **Step 4: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/dynamic-layer-preferences.test.ts tests/dynamic/dynamic-workspace.test.tsx
npm run typecheck
git add src/features/dynamic-replanning/dynamicLayerPreferences.ts src/components/DynamicReplanningWorkspace.tsx tests/dynamic/dynamic-layer-preferences.test.ts tests/dynamic/dynamic-workspace.test.tsx
git commit -m "feat: separate task2 layer color preferences"
```

### Task 5: Render Independent Colors and Extension Overlays

**Files:**
- Modify: `src/features/dynamic-replanning/dynamicDeckLayers.ts`
- Modify: `tests/dynamic/dynamic-deck-layers.test.ts`

- [ ] **Step 1: Add failing layer-color tests**

Assert:

```ts
const layers = createDynamicDeckLayers({...optionsFor("RESULT_HOLD"), preferences});
expect(layers.map(layer => layer.id)).toContain("wrj-task2-task-extensions");

const taskLayer = layerProps<DynamicTaskPolygon>(layers, "wrj-task2-task-polygons");
expect(taskLayer.getFillColor({taskId: "T-A"}).slice(0, 3)).toEqual([17, 34, 51]);

const baseline = layerProps<DynamicTimedPath>(layers, "wrj-task2-baseline-paths");
expect(baseline.getColor({resourceId: "UAV-01"}).slice(0, 3)).toEqual([68, 85, 102]);

preferences.colorMode = "resource";
const active = layerProps<RenderedPath>(layers, "wrj-task2-active-paths");
expect(active.getColor({resourceId: "UAV-02", changeType: "dynamic_new"}).slice(0, 3))
  .toEqual(hexToRgb(preferences.resourceColors["UAV-02"]));
```

Also assert the extension layer receives only `scene.taskExtensions`, not every task polygon.
Assert the task layer uses `originalPolygon` before plan publication, `currentPolygon` after publication, and hides `relation=new` tasks before publication.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/dynamic-deck-layers.test.ts
```

Expected: FAIL because task polygons use change-type colors and no extension layer exists.

- [ ] **Step 3: Split the color resolvers**

Replace the single `colorFor` responsibility with:

```ts
function taskColor(taskId: string, preferences: DynamicLayerPreferencesV1) {
  return hexColor(
    preferences.taskColors[taskId] ?? DEFAULT_TASK_COLOR,
    Math.round(255 * preferences.layers.taskAreas.opacity)
  );
}

function activeRouteColor(
  changeType: DynamicPathChangeType,
  resourceId: string,
  preferences: DynamicLayerPreferencesV1
) {
  return preferences.colorMode === "resource"
    ? hexColor(preferences.resourceColors[resourceId] ?? preferences.changeColors.dynamic_new)
    : hexColor(preferences.changeColors[changeType] ?? preferences.changeColors.dynamic_modified);
}
```

Baseline paths use only `preferences.baselineRouteColor`. Task polygons use only `taskColor(task.taskId, preferences)`. Build the task-layer data for the current playback phase: before publication use `originalPolygon` when present and omit `relation=new`; after publication use `currentPolygon`.

- [ ] **Step 4: Add the extension overlay**

Insert a `PolygonLayer<DynamicTaskExtension>` after the current task polygons:

```ts
new PolygonLayer<DynamicTaskExtension>({
  id: "wrj-task2-task-extensions",
  data: scene.taskExtensions,
  visible: published && preferences.layers.taskAreas.visible,
  filled: true,
  stroked: true,
  opacity: preferences.layers.taskAreas.opacity,
getPolygon: extension => extension.polygon,
  getFillColor: hexColor(preferences.taskExtensionColor, 90),
  getLineColor: hexColor(preferences.taskExtensionColor, 255),
  lineWidthMinPixels: 2
})
```

Use the separate translucent fill plus stronger outline as the extension marker; do not recolor the whole current task.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/dynamic-deck-layers.test.ts tests/dynamic/dynamic-map-overlay.test.tsx
npm run typecheck
git add src/features/dynamic-replanning/dynamicDeckLayers.ts tests/dynamic/dynamic-deck-layers.test.ts
git commit -m "feat: render independent task2 layer colors"
```

### Task 6: Add Sidebar Controls for Every Color Family

**Files:**
- Modify: `src/components/dynamic/DynamicLayerSidebar.tsx`
- Modify: `tests/dynamic/dynamic-controls.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing interaction tests**

Cover:

```ts
await user.click(screen.getByRole("button", {name: "编辑 任务区域"}));
expect(screen.getByLabelText("A号任务（T-A）颜色")).toHaveValue("#36a2ae");
expect(screen.getByLabelText("扩展区域颜色")).toBeInTheDocument();

await user.click(screen.getByRole("button", {name: "编辑 原计划航迹"}));
fireEvent.change(screen.getByLabelText("原计划航迹颜色"), {target: {value: "#112233"}});
expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
  baselineRouteColor: "#112233"
}));

await user.click(screen.getByRole("button", {name: "编辑 当前方案航迹"}));
await user.click(screen.getByRole("button", {name: "按无人机"}));
expect(screen.getByLabelText("1号无人机 颜色")).toBeInTheDocument();
```

Assert opening another layer closes the previous editor.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/dynamic-controls.test.tsx
```

Expected: FAIL because task and baseline controls are absent.

- [ ] **Step 3: Render task and extension controls**

For the task-area row, list `scene.taskPolygons` in scene order. Use `formatObjectName(taskId)` and retain the raw ID in the label/title. Add one extension-color input only when `scene.taskExtensions.length > 0`; otherwise show no misleading extension control.

For the baseline-route row, render one `type="color"` input bound to `baselineRouteColor`. Keep current-route change/resource controls under the active-route row only.

Update legend resolution:

- task row: gradient of present task colors plus an extension swatch when present;
- baseline row: `baselineRouteColor`;
- active row: current change/resource palette;
- resource row: UAV palette.

- [ ] **Step 4: Add compact styling**

Add a two-column color list that keeps the label readable at 300px sidebar width. Do not add nested cards. Ensure color inputs have accessible focus states and labels wrap without overlapping.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-workspace.test.tsx
npm run typecheck
npm run lint
git add src/components/dynamic/DynamicLayerSidebar.tsx tests/dynamic/dynamic-controls.test.tsx src/index.css
git commit -m "feat: edit task2 layer colors independently"
```

### Task 7: Build Detailed Event-Governance Presentations

**Files:**
- Create: `src/features/dynamic-replanning/eventIngestionPresentation.ts`
- Modify: `src/features/dynamic-replanning/decisionPresentation.ts`
- Modify: `tests/dynamic/decision-presentation.test.ts`

- [ ] **Step 1: Add failing presentation tests**

Create a comprehensive fixture and assert:

```ts
const presentation = buildEventIngestionPresentation(scene);
expect(presentation.summary).toEqual({received: 7, effective: 5, duplicate: 1, overridden: 1});
expect(presentation.events).toHaveLength(7);
expect(presentation.events.find(event => event.eventId === "E101")).toMatchObject({
  title: "1号无人机低油量",
  verdict: "已接受并进入规划",
  details: expect.arrayContaining([{label: "剩余油量", value: "13.8 kg"}])
});
expect(presentation.events.find(event => event.eventId === "E102")?.reason)
  .toContain("内容相同，已去重");
expect(presentation.events.find(event => event.eventId === "E104")?.reason)
  .toContain("E105");
expect(presentation.events.find(event => event.eventId === "E106")?.details)
  .toEqual(expect.arrayContaining([
    {label: "优先级", value: "3"},
    {label: "最低覆盖率", value: "90%"}
  ]));
```

Add tests for cancellation, priority, dependency, delayed resource, and missing audit entries. Unknown payloads must produce “具体内容暂不可用” and keep raw JSON in audit only.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/decision-presentation.test.ts
```

Expected: FAIL because no joined event presentation exists.

- [ ] **Step 3: Define the pure presentation model**

Create:

```ts
export interface EventGovernancePresentation {
  eventId: string;
  title: string;
  eventTime: string;
  objectLabel: string;
  verdict: string;
  tone: "accepted" | "ignored" | "overridden" | "unknown";
  reason: string;
  details: PresentationDatum[];
  audit: AuditRow[];
  defaultOpen: boolean;
}

export interface EventIngestionPresentation {
  summary: {received: number; effective: number; duplicate: number; overridden: number};
  conclusion: string;
  events: EventGovernancePresentation[];
}
```

Index `EVENT_AUDIT_ENTRY` facts by `fact.objectIds[0]`. For `MERGED`, use “已接受并进入规划”; for `IGNORED_DUPLICATE`, use “重复事件，未重复应用”; for `MERGED_INTO_OTHER_EVENT`, use “已被其他事件覆盖”. Accepted events use `defaultOpen: true`; ignored/overridden events use `false`.

- [ ] **Step 4: Format event-specific details**

Implement a switch on `event.payload.kind`:

- `RESOURCE_LOW_FUEL`: remaining fuel;
- `RESOURCE_DELAYED`: available-after time;
- `RESOURCE_DEGRADED`: unavailable capabilities;
- `RESOURCE_TIME_CONFLICT`: conflict interval;
- `GEOMETRY_CHANGED`: relation, original/current/extension area, extension ratio from the affected task's geometry context;
- `PRIORITY_CHANGED`: new priority;
- `EARLIEST_START_CHANGED`, `LATEST_FINISH_CHANGED`, `DEADLINE_TYPE_CHANGED`: new constraint value;
- `DEPENDENCY_CHANGED`: predecessor/successor task names;
- `NEW_TASK`: name, priority, time window, coverage ratio, predecessor/successor IDs, area summary;
- `EMPTY` with `TASK_CANCELLED`: final task status, retained pre-event segment count, and remaining post-event segment count;
- `EMPTY` with resource lost/abort/not-transferable: final resource state and remaining future-route count.

When an accepted audit entry has no explicit reason, use “事件载荷通过治理校验，已进入后续影响分析。” Do not show an empty reason field.

All main values use Chinese labels. Store raw event type, raw payload JSON, event ID, raw status, reason, and winning event ID in `audit`.

- [ ] **Step 5: Keep generic stage presentation compatible**

`buildDecisionStagePresentation` continues to handle non-ingestion stages. For `EVENT_INGESTION`, exclude individual `EVENT_AUDIT_ENTRY` rows from the generic `data` list because the dedicated event cards now render them; keep numeric counts and raw audit rows.

- [ ] **Step 6: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/decision-presentation.test.ts
npm run typecheck
git add src/features/dynamic-replanning/eventIngestionPresentation.ts src/features/dynamic-replanning/decisionPresentation.ts tests/dynamic/decision-presentation.test.ts
git commit -m "feat: explain accepted task2 events in detail"
```

### Task 8: Render Event Summary and Per-Event Cards

**Files:**
- Modify: `src/components/dynamic/DecisionProcessPanel.tsx`
- Modify: `tests/dynamic/decision-process-panel.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing DOM tests**

When the selected stage is `EVENT_INGESTION`, assert:

```ts
expect(screen.getByText("接收 7 条")).toBeVisible();
expect(screen.getByText("进入规划 5 条")).toBeVisible();
expect(screen.getByRole("heading", {name: "1号无人机低油量"})).toBeVisible();
expect(screen.getByText("剩余油量")).toBeVisible();
expect(screen.getByText("13.8 kg")).toBeVisible();

const duplicate = screen.getByText("重复事件，未重复应用").closest("details");
expect(duplicate).not.toHaveAttribute("open");
expect(within(duplicate!).getByText(/内容相同/u)).toBeInTheDocument();

const accepted = screen.getByText("已接受并进入规划").closest("details");
expect(accepted).toHaveAttribute("open");
```

Assert raw `TASK_GEOMETRY_CHANGED`, payload JSON, and event IDs are absent outside nested audit details.

- [ ] **Step 2: Run and verify RED**

```powershell
npm run test:run -- tests/dynamic/decision-process-panel.test.tsx
```

Expected: FAIL because the panel renders only generic fact rows.

- [ ] **Step 3: Render the dedicated ingestion view**

Call `buildEventIngestionPresentation(scene)` only when `stage.stageId === "EVENT_INGESTION"`. Render:

1. one compact summary row with four counts;
2. the ingestion conclusion;
3. one native `details` element per event, using `open={event.defaultOpen}` only for initial rendering;
4. title, event time, object, verdict, reason, and formatted details;
5. a nested closed audit `details` block.

Do not render duplicate generic `EVENT_AUDIT_ENTRY` rows in “步骤数据”.

- [ ] **Step 4: Style the event list**

Use full-width unframed rows separated by borders, not nested cards. Accepted/ignored/overridden states use a small status marker and text. Keep the main font at least 13px and audit metadata at least 11px. Long object IDs wrap inside audit details and never create horizontal page scrolling.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test:run -- tests/dynamic/decision-process-panel.test.tsx tests/dynamic/dynamic-workspace.test.tsx
npm run typecheck
npm run lint
git add src/components/dynamic/DecisionProcessPanel.tsx tests/dynamic/decision-process-panel.test.tsx src/index.css
git commit -m "feat: render detailed task2 event governance"
```

### Task 9: Package Regenerated Scenes and Run Full Verification

**Files:**
- Modify: `scripts/prepare-task2-scenes.ts`
- Modify: `tests/cases/prepare-task2-scenes.test.ts`
- Modify: `tests/dynamic/committed-scenes.test.ts`
- Modify: `public/data/task2/scenes/**`
- Delete: `public/task2-layer-color-options.html`

- [ ] **Step 1: Update packaging tests**

Require the preparation script to copy and hash:

```ts
const REQUIRED_TASK2_FILES = [
  "scene.json",
  "baseline.bundle.json",
  "mission_view.v1.json",
  "dynamic_events.json",
  "task_geometry_diff.v1.json",
  "decision_trace.v1.json"
] as const;
```

Assert a missing or invalid geometry diff rejects only that scene package with a file-specific error.

- [ ] **Step 2: Run focused packaging tests and verify RED**

```powershell
npm run test:run -- tests/cases/prepare-task2-scenes.test.ts tests/dynamic/committed-scenes.test.ts
```

Expected: FAIL until the script and committed assets include the new file.

- [ ] **Step 3: Update and run the preparation command**

```powershell
npm run data:prepare-task2 -- --input D:\UserData\Desktop\wrj\wrj-t2\.worktrees\task2-scenario-expansion\output\demo-scenes-v4
```

Expected: nine updated scene directories and provenance hashes. Remove the temporary visual-option HTML with `apply_patch`; do not commit it.

- [ ] **Step 4: Run automated verification**

```powershell
npm run data:check-task2 -- --input D:\UserData\Desktop\wrj\wrj-t2\.worktrees\task2-scenario-expansion\output\demo-scenes-v4
npm run test:run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Run browser visual QA**

Start:

```powershell
npm run dev -- --host 127.0.0.1
```

Inspect Task 2 at 1920x1080 and 1366x768:

- every task area has an independently editable color;
- only true T-A expansion shows the extension overlay;
- independent overlapping tasks are not labeled as expansion;
- original-plan routes stay the same when current-route mode changes;
- current routes switch correctly between change-type and UAV colors;
- the comprehensive ingestion stage shows 7 raw events, 5 effective events, one duplicate, and one overridden event;
- accepted events are open by default and ignored/overridden events remain discoverable;
- no controls, labels, event details, or audit IDs overlap or clip.

Capture screenshots outside `public/` for the comprehensive geometry view, the task-area color editor, and the ingestion event list.

- [ ] **Step 6: Commit the packaged and verified result**

```powershell
git add scripts/prepare-task2-scenes.ts tests/cases/prepare-task2-scenes.test.ts tests/dynamic/committed-scenes.test.ts public/data/task2 src tests
git commit -m "feat: package task2 geometry and event detail updates"
git status --short --branch
```

Expected: clean worktree after the commit; screenshots and temporary HTML are untracked nowhere.

## Completion Evidence

Before declaring completion, report:

- Task 2 Python test, Ruff, and mypy results;
- the v4 export path and nine-scene geometry-diff hash validation;
- frontend data check, full test count, typecheck, lint, and build results;
- confirmation that `baselineRouteColor` differs from `baseline_flown` by default;
- confirmation that task colors, baseline route, change colors, and UAV colors are independently editable;
- comprehensive event counts and one example each of accepted, duplicate, overridden, and new-task detail text;
- visual QA viewport sizes and screenshot paths;
- final Git status for both worktrees.
