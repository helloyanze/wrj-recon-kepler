# Task 2 Dynamic Replanning Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four offline, real-algorithm Task 2 scenarios to the existing Kepler workbench with a clear event-to-replan animation, mode switching, pause/seek/replay controls, and traceable data.

**Architecture:** Keep Task 1 `CaseBundleV2` unchanged. Generate and validate Task 2 scene exports in `wrj-t2`, package them into the frontend, parse `mission_view.v1.json` into an independent `DynamicScene`, and project that scene into dedicated Deck.gl layers. A pure dual-clock reducer drives the presentation phases while a thin React hook schedules animation frames.

**Tech Stack:** Python 3.12, Pydantic 2, Typer, Pytest, React 18, TypeScript 5.6, Zod 3, Redux 4, Kepler.gl 3.2, Deck.gl 8.9, Vitest, Testing Library, Vite.

---

## File map

Task 2 repository (`../wrj-t2`):

- Create `src/task2_replanning/demo/__init__.py`: public demo export API.
- Create `src/task2_replanning/demo/scenarios.py`: four scenario definitions and real event batches.
- Create `src/task2_replanning/demo/export.py`: pipeline execution, output selection, provenance, hashes, and catalog writing.
- Modify `src/task2_replanning/cli.py`: add `export-demo-scenes`.
- Create `tests/demo/test_scenarios.py`: scenario construction and business expectations.
- Create `tests/demo/test_export.py`: exported package, hashes, and status tests.

Frontend repository (`wrj-recon-kepler-demo`):

- Create `src/features/dynamic-replanning/missionViewSchema.ts`: complete Task 2 view and failure-report schemas.
- Create `src/features/dynamic-replanning/dynamicSceneSchema.ts`: catalog, scene config, and provenance schemas.
- Create `src/features/dynamic-replanning/loadDynamicScene.ts`: fetch, hash verification, and per-scene loading.
- Create `src/features/dynamic-replanning/buildDynamicScene.ts`: cross-file validation, lookup indexes, and map projection.
- Create `src/features/dynamic-replanning/dynamicMetrics.ts`: semantically valid metric cards.
- Create `src/features/dynamic-replanning/dynamicPlayback.ts`: pure dual-clock state machine.
- Create `src/features/dynamic-replanning/dynamicInterpolation.ts`: Task 2 resource positions and headings.
- Create `src/features/dynamic-replanning/dynamicDeckLayers.ts`: Task 2 polygons, paths, markers, and transitions.
- Create `src/hooks/useDynamicSceneLibrary.ts`: catalog and selected-scene loading.
- Create `src/hooks/useDynamicPlayback.ts`: `requestAnimationFrame` adapter around the reducer.
- Create `src/components/dynamic/TaskModeSwitch.tsx`: Task 1/Task 2 selector.
- Create `src/components/dynamic/DynamicSceneSidebar.tsx`: scene narrative, phases, resources, and tasks.
- Create `src/components/dynamic/DynamicTimeline.tsx`: mission range with event and commit markers.
- Create `src/components/dynamic/DynamicStatusBanner.tsx`: `COMPLETE` and safe-fallback language.
- Create `src/components/dynamic/DynamicLegend.tsx`: fixed change-type legend.
- Create `src/components/dynamic/DynamicDetailDrawer.tsx`: Task 2 task/resource/segment details.
- Create `src/components/DynamicReplanningWorkspace.tsx`: Task 2 workbench composition and camera effects.
- Create `src/components/StaticPlanningWorkspace.tsx`: current static implementation moved without behavioral change.
- Modify `src/components/Workspace.tsx`: small mode router.
- Modify `src/components/WrjKeplerMap.tsx`: accept a Task 2 overlay.
- Modify `src/components/kepler/UavMapContainer.tsx`: merge static or dynamic Deck layers.
- Modify `src/index.css`: Task 2 layout, markers, banners, reduced-motion rules, and 1366×768 sizing.
- Create `scripts/prepare-task2-scenes.ts`: validate, hash, copy, check, and prune generated scene assets.
- Modify `package.json`: add Task 2 data commands.
- Create `tests/fixtures/task2MissionViewFixture.ts`: small valid frontend fixture.
- Create `tests/dynamic/*.test.ts(x)`: schemas, loading, projection, state machine, layers, hooks, and components.
- Create `public/data/task2/scenes/**`: four generated, committed scene packages.
- Modify `README.md`: generation and offline demo instructions.

## Task 1: Define the four real Task 2 scenarios

**Files:**
- Create: `../wrj-t2/src/task2_replanning/demo/__init__.py`
- Create: `../wrj-t2/src/task2_replanning/demo/scenarios.py`
- Create: `../wrj-t2/tests/demo/test_scenarios.py`

- [ ] **Step 1: Write failing scenario-definition tests**

```python
def test_catalog_contains_the_four_frozen_demo_scenarios(real_task1_context):
    scenarios = build_demo_scenarios(real_task1_context)
    assert [item.scene_id for item in scenarios] == [
        "resource-lost",
        "low-fuel-return",
        "new-area-task",
        "hard-deadline-fallback",
    ]
    assert [item.expected_status for item in scenarios] == [
        PipelineStatus.COMPLETE,
        PipelineStatus.COMPLETE,
        PipelineStatus.COMPLETE,
        PipelineStatus.PARTIAL_SAFE_FALLBACK,
    ]


def test_hard_deadline_is_one_batch_with_both_required_changes(real_task1_context):
    scenario = next(
        item for item in build_demo_scenarios(real_task1_context)
        if item.scene_id == "hard-deadline-fallback"
    )
    assert {event.event_type for event in scenario.event_batch.events} == {
        EventType.TASK_DEADLINE_TYPE_CHANGED,
        EventType.TASK_LATEST_FINISH_CHANGED,
    }
    assert scenario.event_batch.mission_time_sec == scenario.demo_time_sec
```

Add this fixture in the same test module; do not import helpers from another
test module into production code:

```python
@pytest.fixture()
def real_task1_context(baseline_fixture_dir: Path, task1_root: Path):
    return load_task1_baseline(Task1Paths(
        baseline_run=baseline_fixture_dir,
        source_case=task1_root / "input" / "cases" / "R01-BASELINE-01",
    ))
```

- [ ] **Step 2: Run the tests and verify they fail**

Run from `../wrj-t2`:

```powershell
pytest tests/demo/test_scenarios.py -q
```

Expected: collection fails because `task2_replanning.demo.scenarios` does not exist.

- [ ] **Step 3: Implement immutable scenario definitions**

Create these public types and exports:

```python
@dataclass(frozen=True)
class DemoPlayback:
    baseline_lead_in_sec: float
    event_alert_ms: int = 1800
    impact_reveal_ms: int = 2200
    replan_explainer_ms: int = 3200
    plan_transition_ms: int = 2400
    result_hold_ms: int = 5000


@dataclass(frozen=True)
class DemoScenario:
    scene_id: str
    display_name: str
    summary: str
    expected_status: PipelineStatus
    demo_time_sec: float
    event_batch: EventBatch
    playback: DemoPlayback
    event_target_kind: Literal["RESOURCE", "TASK"]
    event_target_id: str


def build_demo_scenarios(context: Task1PlanningContext) -> tuple[DemoScenario, ...]:
    plan = context.plan
    task = plan.tasks[0]
    resource_id = task.assigned_resource_ids[0]
    mission_id = plan.mission_id or plan.case_id
    source_version = plan.source_plan_version

    def batch(batch_id: str, events: list[DynamicEvent], time_sec: float) -> EventBatch:
        return EventBatch(
            batch_id=batch_id,
            mission_id=mission_id,
            source_plan_version=source_version,
            snapshot_id="SNAP-PENDING",
            mission_time_sec=time_sec,
            events=events,
        )

    assert task.geometry is not None
    geometry = task.geometry.model_dump(mode="json", by_alias=True)
    translated = {
        **geometry,
        "coordinates": [[
            [coordinate[0] + 1_500.0, coordinate[1], *coordinate[2:]]
            for coordinate in geometry["coordinates"][0]
        ]],
    }
    translated["coordinates"][0][-1] = translated["coordinates"][0][0]

    return (
        DemoScenario(
            scene_id="resource-lost",
            display_name="无人机失联",
            summary="执行中无人机失联，剩余工作转移给可用资源。",
            expected_status=PipelineStatus.COMPLETE,
            demo_time_sec=100,
            event_batch=batch("B-DEMO-LOST", [
                DynamicEvent(
                    event_id="EV-DEMO-LOST",
                    event_type=EventType.RESOURCE_LOST,
                    event_time_sec=100,
                    affected_object_id=resource_id,
                )
            ], 100),
            playback=DemoPlayback(baseline_lead_in_sec=15),
            event_target_kind="RESOURCE",
            event_target_id=resource_id,
        ),
        DemoScenario(
            scene_id="low-fuel-return",
            display_name="低油量返航",
            summary="执行资源完成安全部分后返航，剩余工作重新分配。",
            expected_status=PipelineStatus.COMPLETE,
            demo_time_sec=200,
            event_batch=batch("B-DEMO-LOW-FUEL", [
                DynamicEvent(
                    event_id="EV-DEMO-LOW-FUEL",
                    event_type=EventType.RESOURCE_LOW_FUEL,
                    event_time_sec=200,
                    affected_object_id=resource_id,
                    payload={"remainingFuelKg": 67.0},
                )
            ], 200),
            playback=DemoPlayback(baseline_lead_in_sec=15),
            event_target_kind="RESOURCE",
            event_target_id=resource_id,
        ),
        DemoScenario(
            scene_id="new-area-task",
            display_name="临时新增侦察区",
            summary="新增区域任务并生成工作单元、分配与航迹。",
            expected_status=PipelineStatus.COMPLETE,
            demo_time_sec=300,
            event_batch=batch("B-DEMO-NEW-TASK", [
                DynamicEvent(
                    event_id="EV-DEMO-NEW-TASK",
                    event_type=EventType.NEW_TASK,
                    event_time_sec=300,
                    affected_object_id="TASK-DEMO-NEW",
                    payload={"task": {
                        "taskId": "TASK-DEMO-NEW",
                        "taskType": "AREA_RECON",
                        "geometry": translated,
                        "minimumCoverageRatio": 0.9,
                    }},
                )
            ], 300),
            playback=DemoPlayback(baseline_lead_in_sec=15),
            event_target_kind="TASK",
            event_target_id="TASK-DEMO-NEW",
        ),
        DemoScenario(
            scene_id="hard-deadline-fallback",
            display_name="硬截止无法满足",
            summary="硬截止不可满足，系统发布可审计的安全回退。",
            expected_status=PipelineStatus.PARTIAL_SAFE_FALLBACK,
            demo_time_sec=400,
            event_batch=batch("B-DEMO-HARD-DEADLINE", [
                DynamicEvent(
                    event_id="EV-DEMO-DEADLINE-TYPE",
                    event_type=EventType.TASK_DEADLINE_TYPE_CHANGED,
                    event_time_sec=400,
                    affected_object_id=task.task_id,
                    payload={"deadlineType": "HARD"},
                ),
                DynamicEvent(
                    event_id="EV-DEMO-LATEST-FINISH",
                    event_type=EventType.TASK_LATEST_FINISH_CHANGED,
                    event_time_sec=400,
                    affected_object_id=task.task_id,
                    payload={"latestFinishTimeSec": 401.0},
                ),
            ], 400),
            playback=DemoPlayback(baseline_lead_in_sec=15),
            event_target_kind="TASK",
            event_target_id=task.task_id,
        ),
    )
```

The helper that translates the polygon must copy coordinates and re-close the
ring; it must never mutate `context.plan`.

- [ ] **Step 4: Run the focused tests**

```powershell
pytest tests/demo/test_scenarios.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/task2_replanning/demo tests/demo/test_scenarios.py
git commit -m "feat: define task2 demo scenarios"
```

## Task 2: Export real Task 2 scene packages with provenance

**Files:**
- Create: `../wrj-t2/src/task2_replanning/demo/export.py`
- Modify: `../wrj-t2/src/task2_replanning/demo/__init__.py`
- Modify: `../wrj-t2/src/task2_replanning/cli.py`
- Create: `../wrj-t2/tests/demo/test_export.py`

- [ ] **Step 1: Write failing export tests**

```python
def test_export_runs_every_scene_and_writes_valid_views(
    baseline_fixture_dir, task1_root, tmp_path
):
    catalog = export_demo_scenes(
        task1_paths=Task1Paths(
            baseline_run=baseline_fixture_dir,
            source_case=task1_root / "input" / "cases" / "R01-BASELINE-01",
        ),
        output_root=tmp_path / "export",
        task2_commit="abc1234",
        generated_at="2026-07-30T00:00:00Z",
    )
    assert [entry["sceneId"] for entry in catalog["scenes"]] == [
        "resource-lost",
        "low-fuel-return",
        "new-area-task",
        "hard-deadline-fallback",
    ]
    for entry in catalog["scenes"]:
        root = tmp_path / "export" / entry["sceneId"]
        view = MissionViewV1.model_validate_json(
            (root / "mission_view.v1.json").read_text(encoding="utf-8")
        )
        assert view.mission.case_id == "R01-BASELINE-01"
        assert (root / "dynamic_events.json").is_file()
        assert (root / "scene.json").is_file()
        assert (root / "provenance.json").is_file()


def test_exported_hashes_match_bytes(tmp_path, exported_demo):
    root = exported_demo / "resource-lost"
    provenance = json.loads((root / "provenance.json").read_text("utf-8"))
    expected = provenance["upstreamSha256"]["mission_view.v1.json"]
    actual = hashlib.sha256((root / "mission_view.v1.json").read_bytes()).hexdigest()
    assert actual == expected
```

Also assert the lost resource has no future segment, the new task has work and
trajectory data, the low-fuel resource has a safe return, and the hard-deadline
package has `PARTIAL_SAFE_FALLBACK`, `UNRESOLVED`, and `failure_report.json`.

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
pytest tests/demo/test_export.py -q
```

Expected: import fails because `export_demo_scenes` is undefined.

- [ ] **Step 3: Implement the exporter**

Use this public signature:

```python
def export_demo_scenes(
    *,
    task1_paths: Task1Paths,
    output_root: Path,
    task2_commit: str,
    generated_at: str,
) -> dict[str, object]:
    context = load_task1_baseline(task1_paths)
    entries: list[dict[str, object]] = []
    for definition in build_demo_scenarios(context):
        with tempfile.TemporaryDirectory(
            prefix=f".{definition.scene_id}-", dir=output_root.parent
        ) as run_directory:
            result = run_pipeline(PipelineRequest(
                task1_paths=task1_paths,
                event_batch=definition.event_batch,
                output_dir=Path(run_directory),
                demo_time_sec=definition.demo_time_sec,
            ))
            if result.status != definition.expected_status:
                raise RuntimeError(
                    f"{definition.scene_id}: expected {definition.expected_status}, "
                    f"got {result.status}: {result.failure_codes}"
                )
            assert result.output_directory is not None
            source = Path(result.output_directory)
            destination = output_root / definition.scene_id
            publish_scene(source, destination, definition, task2_commit, generated_at)
            entries.append(scene_catalog_entry(destination, definition))
    catalog = {"version": 1, "defaultSceneId": entries[0]["sceneId"], "scenes": entries}
    write_canonical_json(output_root / "catalog.json", catalog)
    return catalog
```

`publish_scene` copies only `mission_view.v1.json` and the optional
`failure_report.json`, writes the exact event batch as `dynamic_events.json`,
writes presentation-only `scene.json`, and hashes every published file before
writing `provenance.json`. Use canonical UTF-8 JSON with sorted keys and a final
newline. Write into a temporary sibling directory and replace the completed
scene directory atomically.

- [ ] **Step 4: Add the CLI command**

```python
@app.command("export-demo-scenes")
def export_demo_scenes_command(
    baseline_run: str = typer.Option(..., "--baseline-run"),
    source_case: str = typer.Option(..., "--source-case"),
    output_dir: str = typer.Option(..., "--output"),
    task2_commit: str = typer.Option(..., "--task2-commit"),
    generated_at: str = typer.Option(..., "--generated-at"),
) -> None:
    catalog = export_demo_scenes(
        task1_paths=Task1Paths(Path(baseline_run), Path(source_case)),
        output_root=Path(output_dir),
        task2_commit=task2_commit,
        generated_at=generated_at,
    )
    typer.echo(json.dumps(catalog, ensure_ascii=False, indent=2))
```

- [ ] **Step 5: Run Task 2 export and regression tests**

```powershell
pytest tests/demo tests/integration/test_engine_pipeline.py tests/output -q
ruff check src/task2_replanning/demo tests/demo src/task2_replanning/cli.py
mypy src/task2_replanning/demo
```

Expected: all tests pass; Ruff and mypy report no errors.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/task2_replanning/demo src/task2_replanning/cli.py tests/demo
git commit -m "feat: export traceable task2 demo scenes"
```

## Task 3: Add strict frontend contracts

**Files:**
- Create: `src/features/dynamic-replanning/missionViewSchema.ts`
- Create: `src/features/dynamic-replanning/dynamicSceneSchema.ts`
- Create: `tests/fixtures/task2MissionViewFixture.ts`
- Create: `tests/dynamic/mission-view-schema.test.ts`
- Create: `tests/dynamic/dynamic-scene-schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

```typescript
it("accepts the complete camelCase mission_view.v1 contract", () => {
  expect(missionViewV1Schema.parse(missionViewFixture).schemaVersion)
    .toBe("mission_view.v1");
});

it("rejects unknown fields and invalid plan states", () => {
  expect(() => missionViewV1Schema.parse({
    ...missionViewFixture,
    unexpected: true
  })).toThrow();
  expect(() => missionViewV1Schema.parse({
    ...missionViewFixture,
    activePlan: {...missionViewFixture.activePlan, planStatus: "OK"}
  })).toThrow();
});

it("requires a failure report for a partial scene reference", () => {
  expect(() => scenePackageSchema.parse({
    ...scenePackageFixture,
    resultStatus: "PARTIAL_SAFE_FALLBACK",
    failureReportUrl: null
  })).toThrow();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/mission-view-schema.test.ts tests/dynamic/dynamic-scene-schema.test.ts
```

Expected: module resolution fails for the new schema modules.

- [ ] **Step 3: Implement the mission view schemas**

Define strict schemas for every root field in Python `MissionViewV1`:

```typescript
export const planStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL_SAFE_FALLBACK",
  "FAILED"
]);

export const missionViewV1Schema = z.object({
  schemaVersion: z.literal("mission_view.v1"),
  mission: missionSummarySchema,
  activePlan: activePlanSummarySchema,
  coordinateReference: coordinateReferenceSchema,
  tasks: z.array(missionViewTaskSchema),
  resources: z.array(missionViewResourceSchema),
  workUnits: z.array(missionViewWorkUnitSchema),
  assignments: z.array(missionViewAssignmentSchema),
  trajectories: z.array(missionViewTrajectorySchema),
  eventTimeline: z.array(missionViewEventSchema),
  planDiff: planDiffSchema,
  metrics: rankingMetricsSchema,
  validation: planValidationReportSchema,
  alternativeSummaries: z.array(alternativeSummarySchema),
  timeChains: z.array(timeChainNodeSchema),
  provenance: viewProvenanceSchema
}).strict();

export type MissionViewV1 = z.infer<typeof missionViewV1Schema>;
```

Mirror the exact enum values and required/nullable fields from
`../wrj-t2/schemas/mission_view_v1.schema.json`. Define and export
`failureReportSchema` from the exact Python `FailureReport` contract.

- [ ] **Step 4: Implement scene and provenance schemas**

```typescript
export const sceneConfigSchema = z.object({
  schemaVersion: z.literal("task2-demo-scene.v1"),
  sceneId: nonEmptyString,
  displayName: nonEmptyString,
  summary: nonEmptyString,
  baselineCaseId: nonEmptyString,
  resultStatus: z.enum(["COMPLETE", "PARTIAL_SAFE_FALLBACK"]),
  playback: z.object({
    baselineLeadInSec: nonNegative,
    eventAlertMs: nonNegativeInteger,
    impactRevealMs: nonNegativeInteger,
    replanExplainerMs: nonNegativeInteger,
    planTransitionMs: nonNegativeInteger,
    resultHoldMs: nonNegativeInteger
  }).strict(),
  camera: z.object({
    eventTargetKind: z.enum(["RESOURCE", "TASK"]),
    eventTargetId: nonEmptyString,
    overviewPaddingPx: nonNegativeInteger
  }).strict()
}).strict();
```

Add strict catalog, package, and provenance schemas. Provenance must contain
`task2Commit`, `generationCommand`, `generatedAt`, `snapshotSource`,
`baselinePlanVersion`, `upstreamSha256`, and `packagedSha256`.

Export the inferred types consumed by later tasks:

```typescript
export type DynamicSceneCatalog = z.infer<typeof dynamicSceneCatalogSchema>;
export type DynamicSceneCatalogEntry =
  DynamicSceneCatalog["scenes"][number];
export type SceneConfig = z.infer<typeof sceneConfigSchema>;
export type SceneProvenance = z.infer<typeof sceneProvenanceSchema>;
export type ScenePackageDescriptor = z.infer<typeof scenePackageSchema>;

export interface LoadedDynamicScenePackage {
  config: SceneConfig;
  baseline: CaseBundleV2;
  view: MissionViewV1;
  failureReport: FailureReport | null;
  provenance: SceneProvenance;
}
```

- [ ] **Step 5: Run schema tests and typecheck**

```powershell
npm test -- --run tests/dynamic/mission-view-schema.test.ts tests/dynamic/dynamic-scene-schema.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/features/dynamic-replanning tests/fixtures tests/dynamic
git commit -m "feat: add task2 frontend contracts"
```

## Task 4: Load scenes and verify package integrity

**Files:**
- Create: `src/features/dynamic-replanning/loadDynamicScene.ts`
- Create: `src/hooks/useDynamicSceneLibrary.ts`
- Create: `tests/dynamic/load-dynamic-scene.test.ts`
- Create: `tests/dynamic/use-dynamic-scene-library.test.tsx`

- [ ] **Step 1: Write failing loader tests**

```typescript
it("loads and validates one complete scene", async () => {
  const result = await loadDynamicScene("/data", catalogEntry, fakeFetch(files));
  expect(result.config.sceneId).toBe("resource-lost");
  expect(result.view.activePlan.planStatus).toBe("COMPLETE");
  expect(result.failureReport).toBeNull();
});

it("rejects a changed mission view hash", async () => {
  const changed = new Map(files);
  changed.set("mission_view.v1.json", JSON.stringify({...missionViewFixture, tasks: []}));
  await expect(loadDynamicScene("/data", catalogEntry, fakeFetch(changed)))
    .rejects.toThrow("mission_view.v1.json hash mismatch");
});

it("isolates one broken scene while keeping the catalog usable", async () => {
  renderHook(() => useDynamicSceneLibrary({
    dataBase: "/data",
    fetcher: fakeFetchWithOneBrokenScene()
  }));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.entries.find(item => item.sceneId === "broken")?.disabled)
    .toBe(true);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/load-dynamic-scene.test.ts tests/dynamic/use-dynamic-scene-library.test.tsx
```

Expected: new loader and hook modules are missing.

- [ ] **Step 3: Implement byte-aware loading and SHA-256 verification**

```typescript
export type DynamicFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  const digest = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadDynamicScene(
  dataBase: string,
  entry: DynamicSceneCatalogEntry,
  fetcher: DynamicFetch = fetch
): Promise<LoadedDynamicScenePackage> {
  const baseUrl = `${dataBase.replace(/\/$/u, "")}/${entry.baseUrl}`;
  const provenance = sceneProvenanceSchema.parse(
    await fetchJson(`${baseUrl}/provenance.json`, fetcher)
  );
  const required = [
    "scene.json",
    "baseline.bundle.json",
    "mission_view.v1.json"
  ] as const;
  const bytes = new Map<string, Uint8Array>();
  for (const name of required) {
    const value = await fetchBytes(`${baseUrl}/${name}`, fetcher);
    await verifyHash(name, value, provenance.packagedSha256[name]);
    bytes.set(name, value);
  }
  const config = sceneConfigSchema.parse(parseUtf8Json(bytes.get("scene.json")!));
  const baseline = caseBundleSchema.parse(
    parseUtf8Json(bytes.get("baseline.bundle.json")!)
  );
  const view = missionViewV1Schema.parse(
    parseUtf8Json(bytes.get("mission_view.v1.json")!)
  );
  const failureReport = entry.failureReportUrl === null
    ? null
    : failureReportSchema.parse(await fetchVerifiedJson(
        `${baseUrl}/${entry.failureReportUrl}`,
        entry.failureReportUrl,
        provenance,
        fetcher
      ));
  assertStatusFiles(config.resultStatus, failureReport);
  return {config, baseline, view, failureReport, provenance};
}
```

The loader must throw file-specific errors, require a failure report for
`PARTIAL_SAFE_FALLBACK`, and reject a failure report for a `COMPLETE` scene.

- [ ] **Step 4: Implement the library hook**

Expose:

```typescript
interface DynamicSceneLibrary {
  status: "loading" | "ready" | "error";
  entries: DynamicSceneListEntry[];
  selectedSceneId: string | null;
  scenePackage: LoadedDynamicScenePackage | null;
  error: string | null;
  select(sceneId: string): void;
  retry(): void;
}
```

Use an `AbortController` and a monotonically increasing generation ref so stale
responses cannot replace a newer selection. Catalog failure sets the whole hook
to `error`; a scene failure marks only that entry disabled and retains the last
valid selected package.

- [ ] **Step 5: Run loader tests**

```powershell
npm test -- --run tests/dynamic/load-dynamic-scene.test.ts tests/dynamic/use-dynamic-scene-library.test.tsx
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/features/dynamic-replanning/loadDynamicScene.ts src/hooks/useDynamicSceneLibrary.ts tests/dynamic
git commit -m "feat: load verified task2 scene packages"
```

## Task 5: Prepare and check committed Task 2 assets

**Files:**
- Create: `scripts/prepare-task2-scenes.ts`
- Create: `tests/cases/prepare-task2-scenes.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing preparation tests**

```typescript
it("packages exported views with the matching Task 1 baseline", async () => {
  await prepareTask2Scenes({
    inputRoot,
    baselineRoot,
    outputRoot
  });
  const sceneRoot = resolve(outputRoot, "resource-lost");
  expect(JSON.parse(readFileSync(resolve(sceneRoot, "baseline.bundle.json"), "utf8"))
    .case.caseId).toBe("R01-BASELINE-01");
  expect(JSON.parse(readFileSync(resolve(outputRoot, "catalog.json"), "utf8"))
    .defaultSceneId).toBe("resource-lost");
});

it("check mode reports changed and extra files without writing", async () => {
  await expect(checkTask2Scenes({inputRoot, baselineRoot, outputRoot}))
    .rejects.toThrow(/changed: resource-lost\/mission_view\.v1\.json/);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm test -- --run tests/cases/prepare-task2-scenes.test.ts
```

Expected: `prepare-task2-scenes.ts` does not exist.

- [ ] **Step 3: Implement safe deterministic packaging**

Export these functions for tests:

```typescript
export interface PrepareTask2Options {
  inputRoot: string;
  baselineRoot: string;
  outputRoot: string;
}

export async function prepareTask2Scenes(options: PrepareTask2Options): Promise<void>;
export async function checkTask2Scenes(options: PrepareTask2Options): Promise<void>;
```

For every upstream catalog entry:

1. Validate the upstream scene, view, optional failure report, and provenance.
2. Resolve `baselineCaseId` against
   `public/data/integration-cases/catalog.json`.
3. Copy that case's `bundle.json` as `baseline.bundle.json`.
4. Add its SHA-256 to `packagedSha256`.
5. Write the scene package and a frontend catalog using sorted canonical JSON.
6. Reject unsafe paths, symlinks, output/input overlap, and duplicate scene IDs.
7. In prepare mode, remove only extra entries inside the validated output root.
8. In check mode, perform no writes and report missing, changed, and extra paths.

Add scripts:

```json
"data:prepare-task2": "vite-node --script scripts/prepare-task2-scenes.ts",
"data:check-task2": "vite-node --script scripts/prepare-task2-scenes.ts --check"
```

Require explicit `--input` for the Task 2 export root; default only the baseline
and output roots to the repository's existing public data directories.

- [ ] **Step 4: Run preparation tests**

```powershell
npm test -- --run tests/cases/prepare-task2-scenes.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add scripts/prepare-task2-scenes.ts tests/cases/prepare-task2-scenes.test.ts package.json package-lock.json
git commit -m "feat: package task2 demo assets"
```

## Task 6: Build the dynamic scene projection and metric model

**Files:**
- Create: `src/features/dynamic-replanning/buildDynamicScene.ts`
- Create: `src/features/dynamic-replanning/dynamicMetrics.ts`
- Create: `tests/dynamic/build-dynamic-scene.test.ts`
- Create: `tests/dynamic/dynamic-metrics.test.ts`

- [ ] **Step 1: Write failing projection tests**

```typescript
it("projects local Task 2 points through the baseline display transform", () => {
  const scene = buildDynamicScene(loadedScenePackageFixture);
  const first = scene.activePaths[0].timedPath[0];
  expect(first.slice(0, 3)).toEqual(localToMapPoint(
    missionViewFixture.trajectories[0].segments[0].localPath[0],
    baselineBundleFixture.displayTransform
  ));
});

it("distributes point time by cumulative local distance", () => {
  expect(buildTimedPath(
    [[0, 0, 10], [3, 0, 10], [3, 4, 10]],
    displayTransform,
    10,
    24
  ).map(point => point[3])).toEqual([10, 16, 24]);
});

it("rejects mismatched cases and broken references", () => {
  expect(() => buildDynamicScene(packageWithCaseId("OTHER"))).toThrow(
    "baseline caseId does not match mission view caseId"
  );
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/build-dynamic-scene.test.ts tests/dynamic/dynamic-metrics.test.ts
```

Expected: projection modules are missing.

- [ ] **Step 3: Implement projection types and path timing**

```typescript
export interface DynamicTimedPath {
  segmentId: string;
  trajectoryId: string;
  resourceId: string;
  taskId: string | null;
  workUnitId: string | null;
  segmentType: string;
  changeType: string;
  startTimeSec: number;
  finishTimeSec: number;
  timedPath: TimedMapPoint[];
}

export function buildTimedPath(
  localPath: readonly LocalPoint[],
  transform: DisplayTransform,
  startTimeSec: number,
  finishTimeSec: number
): TimedMapPoint[] {
  if (localPath.length === 0) throw new Error("localPath must not be empty");
  if (!Number.isFinite(startTimeSec) || !Number.isFinite(finishTimeSec)) {
    throw new RangeError("segment times must be finite");
  }
  if (finishTimeSec < startTimeSec) {
    throw new RangeError("finishTimeSec must not precede startTimeSec");
  }
  const cumulative = [0];
  for (let index = 1; index < localPath.length; index += 1) {
    const previous = localPath[index - 1];
    const current = localPath[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2]
    ));
  }
  const total = cumulative.at(-1) ?? 0;
  return localPath.map((point, index) => {
    const ratio = total > 0
      ? cumulative[index] / total
      : localPath.length === 1 ? 0 : index / (localPath.length - 1);
    const [longitude, latitude, altitudeM] = localToMapPoint(point, transform);
    return [
      longitude,
      latitude,
      altitudeM,
      startTimeSec + (finishTimeSec - startTimeSec) * ratio
    ];
  });
}
```

`buildDynamicScene` must validate case ID, source version metadata, resource and
task references, event targets, failure-report requirements, and supported
coordinate frame. When `mapCrs` is `null`, it must ignore `mapPath` for map
placement and project `localPath` through the baseline transform.

Export the complete scene boundary used by playback, layers, and UI:

```typescript
export interface DynamicScene {
  config: SceneConfig;
  baseline: CaseBundleV2;
  view: MissionViewV1;
  events: MissionViewV1["eventTimeline"];
  primaryEvent: MissionViewV1["eventTimeline"][number];
  eventTimeSec: number;
  makespanSec: number;
  baselinePaths: DynamicTimedPath[];
  activePaths: DynamicTimedPath[];
  metricCards: DynamicMetricCard[];
  failureReport: FailureReport | null;
}
```

Select `primaryEvent` by matching `config.camera.eventTargetId` and
`eventTargetKind`; keep the full batch in `events`. Require all events in one
scene to have the same `eventTimeSec`, which is true for the four frozen
scenarios.

- [ ] **Step 4: Implement metric cards without false comparisons**

```typescript
export interface DynamicMetricCard {
  id: "finish-time" | "fuel" | "completion" | "retained" | "new-resources";
  label: string;
  value: number;
  unit: "s" | "kg" | "%" | "架";
  baselineValue: number | null;
  delta: number | null;
}
```

Compare Task 2 `totalFinishTimeSec` only with Task 1
`missionMakespanSec`, and Task 2 `totalFuelKg` only with Task 1 `totalFuelKg`.
Display completion and retained ratios without a Task 1 delta. Never compare
Task 1 `coverageRatio` to Task 2 `totalCompletionRatio`.

- [ ] **Step 5: Run projection tests**

```powershell
npm test -- --run tests/dynamic/build-dynamic-scene.test.ts tests/dynamic/dynamic-metrics.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 6**

```powershell
git add src/features/dynamic-replanning/buildDynamicScene.ts src/features/dynamic-replanning/dynamicMetrics.ts tests/dynamic
git commit -m "feat: project task2 scenes for map playback"
```

## Task 7: Implement the deterministic dual-clock playback engine

**Files:**
- Create: `src/features/dynamic-replanning/dynamicPlayback.ts`
- Create: `src/hooks/useDynamicPlayback.ts`
- Create: `tests/dynamic/dynamic-playback.test.ts`
- Create: `tests/dynamic/use-dynamic-playback.test.tsx`

- [ ] **Step 1: Write failing reducer tests**

```typescript
it("freezes mission time while presentation phases advance", () => {
  let state = createDynamicPlayback(scene);
  state = playDynamicPlayback(state);
  state = advanceDynamicPlayback(state, 15_000, scene);
  expect(state.phase).toBe("EVENT_ALERT");
  expect(state.missionTimeSec).toBe(scene.eventTimeSec);
  state = advanceDynamicPlayback(state, scene.config.playback.eventAlertMs, scene);
  expect(state.phase).toBe("IMPACT_REVEAL");
  expect(state.missionTimeSec).toBe(scene.eventTimeSec);
});

it("seek reconstructs baseline or active state without replaying alerts", () => {
  expect(seekDynamicPlayback(createDynamicPlayback(scene), 50, scene).phase)
    .toBe("BASELINE_RUNNING");
  expect(seekDynamicPlayback(createDynamicPlayback(scene), 500, scene).phase)
    .toBe("ACTIVE_PLAN_RUNNING");
});

it("restart restores READY and automatic camera", () => {
  const restarted = restartDynamicPlayback(
    disableAutomaticCamera(createDynamicPlayback(scene)),
    scene
  );
  expect(restarted.phase).toBe("READY");
  expect(restarted.automaticCamera).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/dynamic-playback.test.ts tests/dynamic/use-dynamic-playback.test.tsx
```

Expected: playback modules are missing.

- [ ] **Step 3: Implement the pure reducer**

```typescript
export type DynamicPlaybackPhase =
  | "READY"
  | "BASELINE_RUNNING"
  | "EVENT_ALERT"
  | "IMPACT_REVEAL"
  | "REPLAN_EXPLAINER"
  | "PLAN_TRANSITION"
  | "ACTIVE_PLAN_RUNNING"
  | "RESULT_HOLD";

export interface DynamicPlaybackState {
  phase: DynamicPlaybackPhase;
  missionTimeSec: number;
  presentationElapsedMs: number;
  playing: boolean;
  rate: PlaybackRate;
  automaticCamera: boolean;
}
```

Implement `create`, `play`, `pause`, `toggle`, `advance`, `seek`, `setRate`,
`restart`, and `disableAutomaticCamera` as pure functions. Carry overflow
milliseconds across phase boundaries so a slow animation frame produces the
same result as many small frames.

- [ ] **Step 4: Implement the React hook**

The hook must schedule `requestAnimationFrame` only while `playing`, clear the
previous timestamp whenever playing or the scene changes, and expose stable
callbacks:

```typescript
export interface DynamicPlaybackController extends DynamicPlaybackState {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(timeSec: number): void;
  setRate(rate: PlaybackRate): void;
  restart(): void;
  disableAutomaticCamera(): void;
}
```

- [ ] **Step 5: Run reducer and hook tests**

```powershell
npm test -- --run tests/dynamic/dynamic-playback.test.ts tests/dynamic/use-dynamic-playback.test.tsx
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 7**

```powershell
git add src/features/dynamic-replanning/dynamicPlayback.ts src/hooks/useDynamicPlayback.ts tests/dynamic
git commit -m "feat: add task2 dual-clock playback"
```

## Task 8: Add Task 2 interpolation and Deck.gl layers

**Files:**
- Create: `src/features/dynamic-replanning/dynamicInterpolation.ts`
- Create: `src/features/dynamic-replanning/dynamicDeckLayers.ts`
- Create: `tests/dynamic/dynamic-interpolation.test.ts`
- Create: `tests/dynamic/dynamic-deck-layers.test.ts`

- [ ] **Step 1: Write failing layer tests**

```typescript
it("freezes a lost resource at the event point", () => {
  const states = selectDynamicResourceStates(scene, playbackAt(500));
  expect(states.find(item =>
    item.resourceId === scene.primaryEvent.affectedObjectId
  ))
    .toMatchObject({operationalState: "LOST", frozen: true});
});

it("uses stable layer ids and change-type colors", () => {
  const layers = createDynamicDeckLayers(optionsFor("PLAN_TRANSITION"));
  expect(layers.map(layer => layer.id)).toEqual([
    "wrj-task2-task-polygons",
    "wrj-task2-baseline-paths",
    "wrj-task2-active-paths",
    "wrj-task2-event-halo",
    "wrj-task2-resource-markers"
  ]);
  const active = layers.find(layer => layer.id === "wrj-task2-active-paths");
  expect(active?.props.getColor({changeType: "dynamic_new"}))
    .toEqual([57, 217, 138, 255]);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/dynamic-interpolation.test.ts tests/dynamic/dynamic-deck-layers.test.ts
```

Expected: dynamic interpolation and layer modules are missing.

- [ ] **Step 3: Implement Task 2 resource interpolation**

Use binary search over `DynamicTimedPath.timedPath`, interpolate longitude,
latitude, altitude, and heading, and select the active trajectory by
`resourceId`. Before the event use baseline sorties. At and after the event use
the active Task 2 paths; a `LOST` resource remains at the event position and has
no active future path.

- [ ] **Step 4: Implement the five dynamic layer groups**

Use `PolygonLayer`, `PathLayer`, and `IconLayer`. The fixed color mapping is:

```typescript
export const CHANGE_COLORS = {
  baseline: [128, 140, 151, 150],
  baseline_locked: [77, 87, 97, 255],
  baseline_reused: [38, 199, 218, 255],
  dynamic_modified: [255, 166, 48, 255],
  dynamic_new: [57, 217, 138, 255],
  dynamic_cancelled: [238, 82, 83, 255]
} as const;
```

Show original future paths as gray dashed paths, explicit cancelled entries as
red fading paths, modified paths as orange pulse, and new paths with a clipped
path prefix derived from transition progress. The event halo is visible only in
`EVENT_ALERT` and `IMPACT_REVEAL`. Add shape or text state in the sidebar for
every color-dependent meaning.

Export the overlay interface used by the map plumbing:

```typescript
export interface DynamicOverlayOptions {
  scene: DynamicScene;
  playback: DynamicPlaybackState;
  verticalScale: VerticalScale;
  onSelectResource?: (resourceId: string) => void;
  onSelectTask?: (taskId: string) => void;
  onSelectSegment?: (segmentId: string) => void;
}
```

- [ ] **Step 5: Run layer tests**

```powershell
npm test -- --run tests/dynamic/dynamic-interpolation.test.ts tests/dynamic/dynamic-deck-layers.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 8**

```powershell
git add src/features/dynamic-replanning/dynamicInterpolation.ts src/features/dynamic-replanning/dynamicDeckLayers.ts tests/dynamic
git commit -m "feat: render task2 dynamic map layers"
```

## Task 9: Plumb dynamic overlays through the existing Kepler map

**Files:**
- Modify: `src/components/WrjKeplerMap.tsx`
- Modify: `src/components/kepler/UavMapContainer.tsx`
- Create: `tests/dynamic/dynamic-map-overlay.test.tsx`
- Modify: `tests/kepler-integration.test.ts`

- [ ] **Step 1: Write failing overlay tests**

```typescript
it("uses dynamic layers when a Task 2 overlay is present", () => {
  const layers = createMissionOverlayLayers({
    bundle: null,
    missionTimeSec: 0,
    verticalScale: 1,
    preferences: null,
    dynamic: dynamicOverlayFixture
  });
  expect(layers.some(layer => layer.id === "wrj-task2-active-paths")).toBe(true);
  expect(layers.some(layer => layer.id === "wrj-algorithm-routes")).toBe(false);
});

it("preserves the existing Task 1 overlay behavior", () => {
  const layers = createMissionOverlayLayers(staticOverlayFixture);
  expect(layers.some(layer => layer.id === "wrj-algorithm-routes")).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/dynamic-map-overlay.test.tsx tests/kepler-integration.test.ts
```

Expected: `MissionOverlayValue` has no `dynamic` property.

- [ ] **Step 3: Extend the overlay contract**

```typescript
export interface MissionOverlayValue {
  bundle: CaseBundleV2 | null;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV3 | null;
  dynamic: DynamicOverlayOptions | null;
  onSelectSortie?: (assignmentId: string) => void;
}
```

`createMissionOverlayLayers` must reject an impossible state where both
`bundle` and `dynamic` are non-null. It returns static layers, dynamic layers,
or an empty array. Add `dynamicOverlay?: DynamicOverlayOptions | null` to
`WrjKeplerMapProps` and pass it through `MissionOverlayContext`.

- [ ] **Step 4: Run map integration tests**

```powershell
npm test -- --run tests/dynamic/dynamic-map-overlay.test.tsx tests/kepler-integration.test.ts tests/wrj-kepler-map.test.tsx
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit Task 9**

```powershell
git add src/components/WrjKeplerMap.tsx src/components/kepler/UavMapContainer.tsx tests
git commit -m "feat: connect task2 overlays to kepler map"
```

## Task 10: Build the Task 2 controls and information panels

**Files:**
- Create: `src/components/dynamic/TaskModeSwitch.tsx`
- Create: `src/components/dynamic/DynamicSceneSidebar.tsx`
- Create: `src/components/dynamic/DynamicTimeline.tsx`
- Create: `src/components/dynamic/DynamicStatusBanner.tsx`
- Create: `src/components/dynamic/DynamicLegend.tsx`
- Create: `src/components/dynamic/DynamicDetailDrawer.tsx`
- Create: `tests/dynamic/task-mode-switch.test.tsx`
- Create: `tests/dynamic/dynamic-controls.test.tsx`
- Create: `tests/dynamic/dynamic-detail-drawer.test.tsx`

- [ ] **Step 1: Write failing component tests**

```typescript
it("labels safe fallback as incomplete but safe", () => {
  render(<DynamicStatusBanner status="PARTIAL_SAFE_FALLBACK" />);
  expect(screen.getByText("安全回退")).toBeInTheDocument();
  expect(screen.getByText("不是完整方案")).toBeInTheDocument();
  expect(screen.queryByText("方案成功")).not.toBeInTheDocument();
});

it("shows event and plan-commit markers on the mission timeline", () => {
  render(<DynamicTimeline {...timelineProps} />);
  expect(screen.getByLabelText("动态事件时刻")).toHaveStyle({left: "40%"});
  expect(screen.getByLabelText("新方案生效时刻")).toBeInTheDocument();
});

it("reports all controls through controlled callbacks", () => {
  render(<DynamicTimeline {...timelineProps} />);
  fireEvent.click(screen.getByRole("button", {name: "播放动态场景"}));
  fireEvent.change(screen.getByRole("slider", {name: "动态任务进度"}), {
    target: {value: "300"}
  });
  expect(timelineProps.onToggle).toHaveBeenCalledOnce();
  expect(timelineProps.onSeek).toHaveBeenCalledWith(300);
});
```

- [ ] **Step 2: Run tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/task-mode-switch.test.tsx tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-detail-drawer.test.tsx
```

Expected: component modules are missing.

- [ ] **Step 3: Implement controlled components**

`TaskModeSwitch` uses two buttons with `aria-pressed`. `DynamicSceneSidebar`
shows scene summary, the eight playback phases, resources, and tasks.
`DynamicTimeline` accepts:

```typescript
interface DynamicTimelineProps {
  missionTimeSec: number;
  makespanSec: number;
  eventTimeSec: number;
  planCommitTimeSec: number;
  playing: boolean;
  rate: PlaybackRate;
  disabled?: boolean;
  onToggle(): void;
  onSeek(value: number): void;
  onRateChange(rate: PlaybackRate): void;
}
```

`DynamicDetailDrawer` accepts discriminated content for resource, task, or
segment and renders source values from `DynamicScene`. Reuse the existing focus
entry, Escape close, and focus restoration pattern from `DetailDrawer.tsx`.

- [ ] **Step 4: Run component tests**

```powershell
npm test -- --run tests/dynamic/task-mode-switch.test.tsx tests/dynamic/dynamic-controls.test.tsx tests/dynamic/dynamic-detail-drawer.test.tsx
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit Task 10**

```powershell
git add src/components/dynamic tests/dynamic
git commit -m "feat: add task2 demo controls and panels"
```

## Task 11: Integrate Task 2 into the workbench

**Files:**
- Create: `src/components/StaticPlanningWorkspace.tsx`
- Create: `src/components/DynamicReplanningWorkspace.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/index.css`
- Create: `tests/dynamic/dynamic-workspace.test.tsx`
- Modify: `tests/workspace.test.tsx`
- Modify: `tests/workspace-panels.test.tsx`

- [ ] **Step 1: Write failing workspace tests**

```typescript
it("switches from Task 1 to Task 2 in the same application", async () => {
  render(<Workspace {...workspaceProps} dynamicDependencies={dependencies} />);
  expect(screen.getByText("静态侦察规划")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "任务二 动态重规划"}));
  expect(await screen.findByText("无人机失联")).toBeInTheDocument();
  expect(screen.getByRole("region", {name: "动态重规划时间轴"}))
    .toBeInTheDocument();
});

it("loads a scene paused at READY and replays on demand", async () => {
  render(<DynamicReplanningWorkspace {...dynamicProps} />);
  expect(await screen.findByRole("button", {name: "播放动态场景"}))
    .toBeEnabled();
  expect(screen.getByText("等待播放")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "重新播放"}));
  expect(dynamicProps.playback.restart).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests and verify they fail**

```powershell
npm test -- --run tests/dynamic/dynamic-workspace.test.tsx tests/workspace.test.tsx tests/workspace-panels.test.tsx
```

Expected: dynamic workspace and mode router do not exist.

- [ ] **Step 3: Preserve the static workbench behind a router**

Move the current `Workspace` implementation unchanged to
`StaticPlanningWorkspace.tsx`, retaining its public props. Replace
`Workspace.tsx` with:

```typescript
export type TaskMode = "STATIC" | "DYNAMIC";

export function Workspace(props: WorkspaceProps) {
  const [mode, setMode] = useState<TaskMode>("STATIC");
  const modeSwitch = <TaskModeSwitch mode={mode} onChange={setMode} />;
  return mode === "STATIC"
    ? <StaticPlanningWorkspace {...props} modeSwitch={modeSwitch} />
    : <DynamicReplanningWorkspace
        basemap={props.basemap}
        debugMode={props.debugMode}
        dataBase={props.dataBase}
        dependencies={props.dynamicDependencies}
        modeSwitch={modeSwitch}
      />;
}
```

Keep optional test dependencies in `WorkspaceProps`; production defaults remain
unchanged.

- [ ] **Step 4: Compose the dynamic workbench**

`DynamicReplanningWorkspace` must:

1. Load the catalog and selected package.
2. Build `DynamicScene` with `useMemo`.
3. Create the playback controller keyed by scene ID.
4. Pass a `DynamicOverlayOptions` object to `WrjKeplerMap`.
5. Dispatch `updateMap` once for the event focus and once for result overview.
6. Disable automatic camera on `onPointerDownCapture` over the map panel.
7. Render scene selector, status banner, sidebar, legend, timeline, and drawer.
8. Leave Task 1 available if the Task 2 catalog fails.

Add a top-level error state that shows the failing filename and short Zod path,
while showing stack details only in debug mode.

- [ ] **Step 5: Add responsive and reduced-motion CSS**

At 1366×768, keep the top bar, left panel, map, legend, and timeline visible
without page scrolling. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .task2-event-halo,
  .task2-change-pulse {
    animation: none;
    transition-duration: 0.01ms;
  }
}
```

Use existing color variables where available; add explicit classes for complete,
safe fallback, and data error. Do not represent a status only by color.

- [ ] **Step 6: Run workspace and regression tests**

```powershell
npm test -- --run tests/dynamic/dynamic-workspace.test.tsx tests/workspace.test.tsx tests/workspace-panels.test.tsx tests/app.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands pass.

- [ ] **Step 7: Commit Task 11**

```powershell
git add src/components/StaticPlanningWorkspace.tsx src/components/DynamicReplanningWorkspace.tsx src/components/Workspace.tsx src/index.css tests
git commit -m "feat: integrate task2 dynamic workbench"
```

## Task 12: Generate, package, and validate the four committed scenes

**Files:**
- Create: `public/data/task2/scenes/catalog.json`
- Create: `public/data/task2/scenes/resource-lost/**`
- Create: `public/data/task2/scenes/low-fuel-return/**`
- Create: `public/data/task2/scenes/new-area-task/**`
- Create: `public/data/task2/scenes/hard-deadline-fallback/**`
- Create: `tests/dynamic/committed-scenes.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add a failing committed-assets test**

```typescript
it("loads all four committed Task 2 scenes offline", async () => {
  const catalog = dynamicSceneCatalogSchema.parse(readJson(
    "public/data/task2/scenes/catalog.json"
  ));
  expect(catalog.scenes.map(item => item.sceneId)).toEqual([
    "resource-lost",
    "low-fuel-return",
    "new-area-task",
    "hard-deadline-fallback"
  ]);
  for (const entry of catalog.scenes) {
    const loaded = await loadDynamicSceneFromDisk(entry);
    const scene = buildDynamicScene(loaded);
    expect(scene.eventTimeSec).toBeGreaterThan(0);
  }
});
```

Define `loadDynamicSceneFromDisk` inside the test. It reads the catalog entry's
relative files with `readFile`, verifies hashes with `sha256Hex`, applies the
same Zod schemas as the browser loader, and returns `LoadedDynamicScenePackage`;
it must not bypass integrity or cross-file validation.

- [ ] **Step 2: Run the test and verify it fails**

```powershell
npm test -- --run tests/dynamic/committed-scenes.test.ts
```

Expected: `public/data/task2/scenes/catalog.json` is missing.

- [ ] **Step 3: Export real scenes from Task 2**

From `../wrj-t2`, use an explicit Task 1 root:

```powershell
$task1Root = $env:WRJ_TASK1_ROOT
if ([string]::IsNullOrWhiteSpace($task1Root)) { throw 'WRJ_TASK1_ROOT is required' }
$task2Commit = git rev-parse HEAD
task2-replan export-demo-scenes `
  --baseline-run tests/contract/R01-BASELINE-01 `
  --source-case "$task1Root/input/cases/R01-BASELINE-01" `
  --output ../wrj-recon-kepler-demo/.generated/task2-scenes `
  --task2-commit $task2Commit `
  --generated-at 2026-07-30T00:00:00Z
```

Expected: four scene directories and `catalog.json` are produced; the command
fails if any result status or business assertion differs.

- [ ] **Step 4: Package scenes into the frontend**

From `wrj-recon-kepler-demo`:

```powershell
npm run data:prepare-task2 -- --input .generated/task2-scenes
npm run data:check-task2 -- --input .generated/task2-scenes
```

Expected: both commands pass and the committed asset tree contains no extra
files.

- [ ] **Step 5: Run committed-scene and full frontend verification**

```powershell
npm test -- --run tests/dynamic/committed-scenes.test.ts
npm run test:run
npm run typecheck
npm run lint
npm run build
```

Expected: all tests pass; typecheck, lint, and production build succeed.

- [ ] **Step 6: Document reproducible generation**

Add README commands for:

- setting `WRJ_TASK1_ROOT`;
- exporting with explicit Task 2 commit and generation timestamp;
- running `data:prepare-task2` and `data:check-task2`;
- starting the frontend and switching to Task 2;
- explaining that `demoTimeSec` produces a `SIMULATED` snapshot and is not live telemetry.

- [ ] **Step 7: Commit Task 12**

```powershell
git add public/data/task2/scenes tests/dynamic/committed-scenes.test.ts README.md
git commit -m "feat: add real task2 demo scene data"
```

## Task 13: Final behavior, accessibility, and regression verification

**Files:**
- Modify only files implicated by failures from the commands below.

- [ ] **Step 1: Run the Task 2 backend suite**

From `../wrj-t2`:

```powershell
pytest -q
ruff check src tests
mypy src/task2_replanning
```

Expected: all tests pass; Ruff and mypy report no errors.

- [ ] **Step 2: Run the complete frontend suite**

From `wrj-recon-kepler-demo`:

```powershell
npm run test:run
npm run typecheck
npm run lint
npm run data:check-algorithm
npm run data:check-task2 -- --input .generated/task2-scenes
npm run build
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Verify the four narrative outcomes in the browser**

Run:

```powershell
npm run dev
```

For each scene, verify:

- playback starts only after clicking Play;
- baseline motion reaches the event marker;
- mission time freezes during alert, impact, explanation, and transition;
- the affected object and changed paths are visually distinct;
- pause, seek, rate, and replay work without route jumps;
- `resource-lost` freezes the lost UAV and removes its future active path;
- `low-fuel-return` shows the safe return;
- `new-area-task` reveals the new area and its new paths;
- `hard-deadline-fallback` says “安全回退，不是完整方案” and marks unresolved work;
- a manual map drag cancels automatic camera for the current replay;
- switching back to Task 1 preserves the existing static experience.

- [ ] **Step 4: Verify 1366×768 and reduced motion**

At 1366×768, confirm the mode switch, scene selector, status, sidebar, map,
legend, and timeline are visible without page scrolling. Enable reduced motion
in browser emulation and confirm pulsing and fly-camera motion are replaced by
simple state changes.

- [ ] **Step 5: Confirm verification left no uncommitted changes**

```powershell
git status --short
```

Expected: no output. If verification exposes a defect, return to the task that
owns the behavior, add a failing regression test, implement the smallest fix,
rerun that task's commands, and commit the exact files named by `git status`.
