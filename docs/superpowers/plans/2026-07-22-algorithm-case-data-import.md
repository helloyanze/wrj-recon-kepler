# Algorithm Case Data and ZIP Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one validated conversion core that turns the repository's algorithm outputs and future single-case ZIP uploads into persistent `CaseBundleV2` packages.

**Architecture:** TypeScript/Zod conversion modules under `src/features/cases` are shared by a `tsx` Node catalog generator and a browser Web Worker. Built-in normalized cases are emitted under `public/data/integration-cases`; uploaded cases are parsed off the main thread and persisted in IndexedDB through a small repository interface.

**Tech Stack:** TypeScript 5.6, Zod 3.23, fflate, idb, fake-indexeddb, Node 20.19, Vitest 2.1, Vite 5.4

---

**Prerequisite:** Read `docs/superpowers/specs/2026-07-22-algorithm-case-import-3d-animation-design.md`. Preserve the user's modified `README.md`, untracked `data/`, and untracked `traccar-web/`; only read `data/integration-validation/` and never stage it.

## File map

- Create `src/features/cases/caseBundle.ts`: normalized interfaces and constants.
- Create `src/features/cases/missionPlanSchema.ts`: raw algorithm Zod schema and parse errors.
- Create `src/features/cases/displayTransform.ts`: local-metre visual anchoring.
- Create `src/features/cases/trajectoryTimeline.ts`: segment timing and four-dimensional path construction.
- Create `src/features/cases/convertMissionPlan.ts`: raw-to-normalized orchestration.
- Create `src/features/cases/catalogSchema.ts`: built-in case catalog schema.
- Create `src/features/cases/loadCaseCatalog.ts`: HTTP catalog and bundle loading.
- Create `src/features/cases/importPackage.ts`: ZIP discovery, limits, hashing, and conversion.
- Create `src/features/cases/import.worker.ts`: browser worker protocol.
- Create `src/features/cases/caseRepository.ts`: IndexedDB storage and memory fallback.
- Create `scripts/prepare-algorithm-cases.ts`: valid-run discovery and deterministic public output.
- Create `tests/fixtures/missionPlanFixture.ts`: minimal exact algorithm-format fixture.
- Create focused tests under `tests/cases/`.
- Modify `package.json` and `package-lock.json`: exact dependencies and scripts.
- Generate `public/data/integration-cases/catalog.json` and one directory per selected valid case; never commit `data/integration-validation/`.

### Task 1: Install the shared runtime safely

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Check temporary registries without changing npm configuration**

Run:

```powershell
npm config get registry
npm ping --registry=https://registry.npmmirror.com
npm ping --registry=https://registry.npmjs.org
```

Expected: at least one command prints `PONG`. Record the first reachable registry as `$wrjRegistry`; do not run `npm config set registry`.

- [ ] **Step 2: Install exact dependencies using only the reachable temporary registry**

Run:

```powershell
npm install --save-exact @deck.gl/core@8.9.36 @deck.gl/geo-layers@8.9.36 fflate@0.8.2 idb@8.0.3 --registry=$wrjRegistry
npm install --save-dev --save-exact fake-indexeddb@6.0.1 tsx@4.20.3 --registry=$wrjRegistry
```

Expected: exit code 0; the user's global/project registry remains unchanged.

- [ ] **Step 3: Add deterministic data scripts**

Add these entries to `package.json`:

```json
{
  "scripts": {
    "data:prepare-algorithm": "tsx scripts/prepare-algorithm-cases.ts",
    "data:check-algorithm": "tsx scripts/prepare-algorithm-cases.ts --check"
  }
}
```

- [ ] **Step 4: Verify the dependency graph**

Run:

```powershell
npm ls @deck.gl/core @deck.gl/geo-layers fflate idb fake-indexeddb tsx
```

Expected: the five requested packages resolve with no `invalid` or `extraneous` marker.

- [ ] **Step 5: Commit dependency setup**

```powershell
git add package.json package-lock.json
git commit -m "build: add algorithm import dependencies"
```

### Task 2: Define raw and normalized contracts

**Files:**
- Create: `src/features/cases/caseBundle.ts`
- Create: `src/features/cases/missionPlanSchema.ts`
- Create: `tests/fixtures/missionPlanFixture.ts`
- Create: `tests/cases/mission-plan-schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `tests/cases/mission-plan-schema.test.ts` with these cases:

```ts
import {describe, expect, it} from "vitest";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";
import {parseMissionPlan} from "../../src/features/cases/missionPlanSchema";

describe("parseMissionPlan", () => {
  it("accepts the exact assignment and segment field names", () => {
    const parsed = parseMissionPlan(missionPlanFixture, "mission_plan.json");
    expect(parsed.assignmentPlan.assignments[0]).toMatchObject({
      assignmentId: "ASG-0001-001",
      uavId: "UAV-04",
      stripIds: ["ST-0001"],
      plannedLaunchTimeSec: 0,
      batchIndex: 0
    });
    expect(parsed.trajectories[0].segments[0].segmentType).toBe("CLIMB");
  });

  it("reports the source file and zod field path", () => {
    const invalid = structuredClone(missionPlanFixture);
    invalid.assignmentPlan.assignments[0].plannedLaunchTimeSec = Number.NaN;
    expect(() => parseMissionPlan(invalid, "nested/mission_plan.json"))
      .toThrow(/nested\/mission_plan\.json.*plannedLaunchTimeSec/s);
  });

  it("rejects an infeasible plan", () => {
    expect(() => parseMissionPlan({...missionPlanFixture, feasible: false}, "mission_plan.json"))
      .toThrow(/feasible/);
  });
});
```

Create `tests/fixtures/missionPlanFixture.ts` as a complete one-strip plan using the real field names confirmed in R10: `stripStartIndex`, `stripEndIndex`, `stripIds`, `plannedLaunchTimeSec`, `batchIndex`, and segment `startPoint/endPoint` with `xM/yM/zM`. Include CLIMB, COVERAGE_LINE and DESCENT segments with finite values and `feasible: true`.

- [ ] **Step 2: Run the schema test and verify failure**

Run:

```powershell
npx vitest run tests/cases/mission-plan-schema.test.ts
```

Expected: FAIL because `missionPlanSchema.ts` does not exist.

- [ ] **Step 3: Add normalized types**

Create `src/features/cases/caseBundle.ts` with these public types:

```ts
export const CASE_BUNDLE_VERSION = 2 as const;
export type LocalPoint = readonly [xM: number, yM: number, zM: number];
export type MapPoint = readonly [longitude: number, latitude: number, altitudeM: number];
export type TimedMapPoint = readonly [longitude: number, latitude: number, altitudeM: number, missionTimeSec: number];
export type SegmentType = "TAKEOFF" | "CLIMB" | "ENTRY" | "COVERAGE_LINE" | "TURN" | "RETURN" | "DESCENT" | "LANDING";

export interface NormalizedAssignment {
  assignmentId: string;
  uavId: string;
  baseId: string;
  flightCandidateId: string;
  stripIds: string[];
  stripStartIndex: number;
  stripEndIndex: number;
  batchIndex: number;
  plannedLaunchTimeSec: number;
}

export interface TimedSegment {
  segmentId: string;
  segmentType: SegmentType;
  stripId: string | null;
  startTimeSec: number;
  endTimeSec: number;
  heightM: number;
  speedMps: number;
  distanceM: number;
  fuelConsumptionKg: number;
  localPath: LocalPoint[];
  mapPath: MapPoint[];
  timedPath: TimedMapPoint[];
}

export interface NormalizedSortie {
  trajectoryId: string;
  assignmentId: string;
  uavId: string;
  batchIndex: number;
  plannedLaunchTimeSec: number;
  stripIds: string[];
  totalDistanceM: number;
  totalDurationSec: number;
  totalFuelKg: number;
  segments: TimedSegment[];
  trip: TimedMapPoint[];
}

export interface DisplayTransform {
  anchorLongitude: number;
  anchorLatitude: number;
  sourceCenterXM: number;
  sourceCenterYM: number;
  xAxis: "EAST";
  yAxis: "NORTH";
}

export interface CaseBundleV2 {
  version: typeof CASE_BUNDLE_VERSION;
  case: {caseId: string; planId: string; displayName: string};
  assignments: NormalizedAssignment[];
  sorties: NormalizedSortie[];
  strips: Array<{stripId: string; index: number; uavId: string; assignmentId: string; line: MapPoint[]; polygon: MapPoint[]}>;
  region: {source: "REGION_PROFILE" | "DERIVED_FROM_STRIPS"; polygon: MapPoint[]};
  metrics: {uavCount: number; sortieCount: number; batchCount: number; stripCount: number; coverageRatio: number; missionMakespanSec: number; totalDistanceM: number; totalFuelKg: number};
  validation: {valid: boolean; warnings: string[]; failureCodes: string[]};
  displayTransform: DisplayTransform;
  provenance: {sourceName: string; sourceRun: string; importedAt: string; sha256: string};
}
```

- [ ] **Step 4: Implement the exact raw schema and readable errors**

Create `missionPlanSchema.ts` with finite-number refinement, the eight allowed segment types, exact R10 assignment/trajectory/strip shapes, `.passthrough()` on objects for forward-compatible extra fields, and:

```ts
export function parseMissionPlan(value: unknown, source: string): MissionPlan {
  const result = missionPlanSchema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new Error(`${source} 算法计划校验失败: ${details}`);
}
```

Add a schema refinement requiring `feasible === true`, non-empty assignments/trajectories/strips, and `validationReport.valid !== false`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run tests/cases/mission-plan-schema.test.ts
npm run typecheck
```

Expected: PASS.

```powershell
git add src/features/cases/caseBundle.ts src/features/cases/missionPlanSchema.ts tests/fixtures/missionPlanFixture.ts tests/cases/mission-plan-schema.test.ts
git commit -m "feat: define algorithm case contracts"
```

### Task 3: Implement honest local-metre visual anchoring

**Files:**
- Create: `src/features/cases/displayTransform.ts`
- Create: `tests/cases/display-transform.test.ts`

- [ ] **Step 1: Write failing transform tests**

```ts
import {describe, expect, it} from "vitest";
import {createDisplayTransform, localToMapPoint} from "../../src/features/cases/displayTransform";

describe("display transform", () => {
  it("anchors the source centre at Riyue Bay", () => {
    const transform = createDisplayTransform([[0, 0, 0], [100_000, 80_000, 2_900]]);
    expect(localToMapPoint([50_000, 40_000, 2_900], transform)).toEqual([110.235, 18.625, 2_900]);
  });

  it("maps positive X east and positive Y north while preserving metre scale", () => {
    const transform = createDisplayTransform([[0, 0, 0], [100_000, 80_000, 0]]);
    const centre = localToMapPoint([50_000, 40_000, 0], transform);
    const east = localToMapPoint([51_000, 40_000, 0], transform);
    const north = localToMapPoint([50_000, 41_000, 0], transform);
    expect(east[0]).toBeGreaterThan(centre[0]);
    expect(north[1]).toBeGreaterThan(centre[1]);
    expect(east[2]).toBe(0);
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run `npx vitest run tests/cases/display-transform.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the transform**

Use the fixed anchor and a local tangent approximation:

```ts
const EARTH_RADIUS_M = 6_378_137;
const ANCHOR_LONGITUDE = 110.235;
const ANCHOR_LATITUDE = 18.625;

export function localToMapPoint(point: LocalPoint, transform: DisplayTransform): MapPoint {
  const radians = Math.PI / 180;
  const dx = point[0] - transform.sourceCenterXM;
  const dy = point[1] - transform.sourceCenterYM;
  return [
    transform.anchorLongitude + dx / (EARTH_RADIUS_M * Math.cos(transform.anchorLatitude * radians)) / radians,
    transform.anchorLatitude + dy / EARTH_RADIUS_M / radians,
    point[2]
  ];
}
```

`createDisplayTransform` must reject an empty point set and compute the centre from finite X/Y bounds. Do not rotate or invent a georeference.

- [ ] **Step 4: Run tests and commit**

Run `npx vitest run tests/cases/display-transform.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/cases/displayTransform.ts tests/cases/display-transform.test.ts
git commit -m "feat: anchor algorithm coordinates for display"
```

### Task 4: Build segment-accurate mission timelines

**Files:**
- Create: `src/features/cases/trajectoryTimeline.ts`
- Create: `tests/cases/trajectory-timeline.test.ts`

- [ ] **Step 1: Write failing timing tests**

Cover these exact assertions:

```ts
expect(timeline[0].startTimeSec).toBe(1_206.801);
expect(timeline[0].timedPath[0][3]).toBe(1_206.801);
expect(timeline[1].startTimeSec).toBe(timeline[0].endTimeSec);
expect(climb.timedPath).toEqual([
  [expect.any(Number), expect.any(Number), 0, 1_206.801],
  [expect.any(Number), expect.any(Number), 2_900, 1_226.134]
]);
expect(turn.timedPath).toHaveLength(turn.geometry.coordinates.length);
expect(turn.timedPath.at(-1)?.[3]).toBeCloseTo(turn.endTimeSec, 6);
```

Also test that zero-duration TAKEOFF produces one point, negative duration throws with `segmentId`, and duplicate boundary points are de-duplicated only when all four values match.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/trajectory-timeline.test.ts`.

Expected: FAIL because `buildTrajectoryTimeline` is missing.

- [ ] **Step 3: Implement local path reconstruction**

For each segment:

1. Start with every geometry `[x, y]` vertex.
2. Assign the first vertex `startPoint.zM` and the last `endPoint.zM`.
3. Interpolate intermediate Z values by cumulative horizontal distance; use linear index only when horizontal distance is zero.
4. For a positive-duration one-point segment, return both start and end local points so CLIMB/DESCENT preserve vertical motion.
5. For a zero-duration one-point segment, return one point.

- [ ] **Step 4: Implement time assignment**

`buildTrajectoryTimeline(trajectory, assignment, transform)` begins at `assignment.plannedLaunchTimeSec`, accumulates every `durationSec`, and assigns vertex times by cumulative 3D path distance. When total 3D distance is zero, assign times by vertex index. The final vertex must equal the exact segment end time to avoid floating-point drift.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run tests/cases/trajectory-timeline.test.ts
npm run typecheck
```

Expected: PASS.

```powershell
git add src/features/cases/trajectoryTimeline.ts tests/cases/trajectory-timeline.test.ts
git commit -m "feat: build segment accurate flight timelines"
```

### Task 5: Convert a full plan to `CaseBundleV2`

**Files:**
- Create: `src/features/cases/convertMissionPlan.ts`
- Create: `tests/cases/convert-mission-plan.test.ts`

- [ ] **Step 1: Write failing conversion tests**

Use the fixture plus a second assignment and assert:

```ts
const bundle = await convertMissionPlan({
  missionPlan: plan,
  regionProfile: null,
  sourceName: "fixture.zip",
  sourceRun: "20260721T192032",
  importedAt: "2026-07-22T00:00:00.000Z",
  sha256: "abc123"
});

expect(bundle.version).toBe(2);
expect(bundle.assignments.map(({assignmentId}) => assignmentId)).toEqual(["ASG-0001-001", "ASG-0002-001"]);
expect(bundle.sorties.map(({plannedLaunchTimeSec}) => plannedLaunchTimeSec)).toEqual([0, 1_206.801]);
expect(bundle.strips[0]).toMatchObject({stripId: "ST-0001", uavId: "UAV-04", assignmentId: "ASG-0001-001"});
expect(bundle.region.source).toBe("DERIVED_FROM_STRIPS");
expect(bundle.metrics).toMatchObject({uavCount: 1, sortieCount: 2, batchCount: 2});
```

Add rejection tests for duplicate assignment IDs, a trajectory without an assignment, a strip assigned twice, a missing trajectory, overlapping time intervals for two assignments of the same physical UAV, and mission makespan earlier than the last segment end.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/convert-mission-plan.test.ts`.

Expected: FAIL because the converter does not exist.

- [ ] **Step 3: Implement conversion and cross-reference checks**

`convertMissionPlan` must:

- parse raw JSON through `parseMissionPlan` before use;
- collect all segment, strip line and strip polygon points to build one display transform;
- sort assignments by `plannedLaunchTimeSec`, then `batchIndex`, then `assignmentId`;
- require exactly one trajectory for every assignment;
- build an assignment-by-strip map and reject duplicate/missing ownership;
- convert `strip.start/end` and `coveragePolygon` into map coordinates at altitude 0;
- build sorties with `buildTrajectoryTimeline`;
- sort each physical UAV's sorties by start time and reject an overlap when the next sortie starts before the previous sortie ends (tolerance `1e-6s`);
- derive a region polygon from the convex hull of strip coverage vertices when no valid `region_profile.geometryWkt` is supplied;
- copy authoritative metrics from the plan and compute only `uavCount`, `sortieCount` and `stripCount` from normalized arrays;
- assert computed counts match algorithm counts where both exist;
- return warnings without changing `validation.valid`.

- [ ] **Step 4: Run tests and commit**

Run `npx vitest run tests/cases/convert-mission-plan.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/cases/convertMissionPlan.ts tests/cases/convert-mission-plan.test.ts
git commit -m "feat: convert algorithm plans into case bundles"
```

### Task 6: Discover latest valid runs and generate the built-in catalog

**Files:**
- Create: `src/features/cases/catalogSchema.ts`
- Create: `scripts/prepare-algorithm-cases.ts`
- Create: `tests/cases/prepare-algorithm-cases.test.ts`
- Modify: `.gitignore`
- Generate: `public/data/integration-cases/catalog.json`
- Generate: `public/data/integration-cases/<caseId>/bundle.json`

- [ ] **Step 1: Write failing discovery tests with temporary directories**

The test must create two R10 runs where the newer run is infeasible and assert the older feasible run is selected; then add a newer feasible run and assert it replaces the older one. Assert directories named `intermediate` are never treated as runs.

```ts
expect(selected.get("R10-LONG-TRANSIT-01")?.runId).toBe("20260721T192032");
expect(catalog.defaultCaseId).toBe("R10-LONG-TRANSIT-01");
expect(catalog.cases.every(({bundleUrl}) => bundleUrl.startsWith("/data/integration-cases/"))).toBe(true);
```

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/prepare-algorithm-cases.test.ts`.

Expected: FAIL because discovery exports do not exist.

- [ ] **Step 3: Implement deterministic discovery**

Export `discoverValidRuns(inputRoot)` and `prepareAlgorithmCases(options)` from the script. Read only files named `mission_plan.json`; parse every candidate; group by `caseId`; keep candidates with `feasible === true`, `validationReport.valid !== false`, non-empty assignments and trajectories; select the lexicographically greatest run directory name. Sort the catalog by `caseId` and JSON keys deterministically.

The CLI defaults must be:

```ts
const inputRoot = resolve("data/integration-validation");
const outputRoot = resolve("public/data/integration-cases");
const defaultCaseId = "R10-LONG-TRANSIT-01";
```

`--check` writes to a temporary directory, compares hashes with the committed output, and exits non-zero on drift without modifying `public/`.

- [ ] **Step 4: Generate normalized built-in assets**

Run:

```powershell
npm run data:prepare-algorithm
npm run data:check-algorithm
```

Expected: every valid case appears exactly once; default is R10; the check exits 0. If generated output is large, keep minified JSON and do not include optional raw/intermediate files.

- [ ] **Step 5: Add only generated output and source code**

Ensure `.gitignore` continues to ignore `.superpowers/` and `.worktrees/`. Do not add an ignore rule that hides `public/data/integration-cases`.

Run:

```powershell
git status --short
git add package.json scripts/prepare-algorithm-cases.ts src/features/cases/catalogSchema.ts tests/cases/prepare-algorithm-cases.test.ts public/data/integration-cases
git diff --cached --name-only
```

Expected: no path under `data/integration-validation`, `traccar-web`, or the modified `README.md` is staged.

- [ ] **Step 6: Run tests and commit**

```powershell
npx vitest run tests/cases/prepare-algorithm-cases.test.ts
npm run data:check-algorithm
git commit -m "feat: generate built in algorithm case catalog"
```

### Task 7: Load built-in bundles through a stable catalog API

**Files:**
- Create: `src/features/cases/loadCaseCatalog.ts`
- Create: `tests/cases/load-case-catalog.test.ts`

- [ ] **Step 1: Write failing HTTP and cancellation tests**

Test `loadCaseCatalog(dataBase, signal)` and `loadBuiltInCase(entry, signal)` for success, 404 with exact URL, invalid JSON, schema failure and `AbortError`. Include mirror rebasing from `/data/integration-cases/...` to `/mirror-data/integration-cases/...`.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/load-case-catalog.test.ts`.

Expected: FAIL because the loader is missing.

- [ ] **Step 3: Implement loader without duplicating fetch behavior**

Reuse `src/data/loadJson.ts` and extract the current URL-rebasing rule into a focused exported helper. Parse catalog and bundles with Zod before returning them. Export:

```ts
export function loadCaseCatalog(dataBase: string, signal?: AbortSignal): Promise<CaseCatalogV1>;
export function loadBuiltInCase(entry: CaseCatalogEntry, dataBase: string, signal?: AbortSignal): Promise<CaseBundleV2>;
```

- [ ] **Step 4: Run tests and commit**

Run `npx vitest run tests/cases/load-case-catalog.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/cases/loadCaseCatalog.ts src/features/cases/catalogSchema.ts src/data/loadCase.ts tests/cases/load-case-catalog.test.ts
git commit -m "feat: load algorithm case catalogs"
```

### Task 8: Parse fixed-format ZIP packages in a worker

**Files:**
- Create: `src/features/cases/importPackage.ts`
- Create: `src/features/cases/import.worker.ts`
- Create: `tests/cases/import-package.test.ts`

- [ ] **Step 1: Write failing ZIP contract tests**

Use `fflate.zipSync` to build in-memory packages. Assert:

- nested `run/mission_plan.json` succeeds;
- zero or two files named `mission_plan.json` fail;
- `score_report.json`, `validation_report.json`, `trajectories.geojson` and `intermediate/region_profile.json` are optional;
- `../mission_plan.json` fails path safety validation;
- file count, compressed size, uncompressed size and per-file limits fail before JSON conversion;
- cancellation before conversion throws `AbortError`;
- the returned preview contains case ID, UAV count, sortie count, batch count, strip count, duration and warnings.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/import-package.test.ts`.

Expected: FAIL because `importPackage.ts` does not exist.

- [ ] **Step 3: Implement ZIP limits and deterministic discovery**

Use these exported defaults:

```ts
export const ZIP_LIMITS = {
  compressedBytes: 100 * 1024 * 1024,
  uncompressedBytes: 250 * 1024 * 1024,
  fileCount: 2_000,
  singleFileBytes: 50 * 1024 * 1024
} as const;
```

Normalize separators to `/`, reject absolute paths, drive letters and `..` segments, ignore `__MACOSX/` and hidden OS files, and match optional files by basename. Hash the original ZIP with Web Crypto SHA-256. Use `fflate.unzipSync` only inside the worker.

- [ ] **Step 4: Implement a typed worker protocol**

```ts
export type ImportWorkerRequest =
  | {type: "parse"; requestId: string; fileName: string; bytes: ArrayBuffer}
  | {type: "cancel"; requestId: string};

export type ImportWorkerResponse =
  | {type: "progress"; requestId: string; stage: "unzip" | "validate" | "convert"; percent: number}
  | {type: "success"; requestId: string; bundle: CaseBundleV2; preview: ImportPreview}
  | {type: "failure"; requestId: string; message: string};
```

Transfer the input ArrayBuffer to the worker, track cancelled request IDs, and never post a success response after cancellation.

- [ ] **Step 5: Run tests and commit**

Run `npx vitest run tests/cases/import-package.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/cases/importPackage.ts src/features/cases/import.worker.ts tests/cases/import-package.test.ts
git commit -m "feat: parse algorithm zip packages"
```

### Task 9: Persist imported cases with safe fallback

**Files:**
- Create: `src/features/cases/caseRepository.ts`
- Create: `tests/cases/case-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Load `fake-indexeddb/auto` and test:

```ts
await repository.save(bundle);
expect(await repository.list()).toEqual([expect.objectContaining({caseId: bundle.case.caseId})]);
expect(await repository.get(bundle.case.caseId, bundle.case.planId)).toEqual(bundle);
await expect(repository.save(changedBundle, {overwrite: false})).rejects.toThrow(/已存在/);
await repository.save(changedBundle, {overwrite: true});
expect((await repository.get(bundle.case.caseId, bundle.case.planId))?.provenance.sha256).toBe("changed");
await repository.remove(bundle.case.caseId, bundle.case.planId);
expect(await repository.list()).toEqual([]);
```

Also force `indexedDB.open` to fail and assert the memory repository supports the same session API while returning `{persistent: false}`.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/cases/case-repository.test.ts`.

Expected: FAIL because `caseRepository.ts` is missing.

- [ ] **Step 3: Implement IndexedDB storage**

Use database `wrj-algorithm-cases`, version 1, object store `bundles`, and key `${caseId}:${planId}`. Store a lightweight list record separately from the full bundle so the case selector does not deserialize every trajectory. Export:

```ts
export interface CaseRepository {
  persistent: boolean;
  list(): Promise<ImportedCaseEntry[]>;
  get(caseId: string, planId: string): Promise<CaseBundleV2 | undefined>;
  save(bundle: CaseBundleV2, options?: {overwrite?: boolean}): Promise<void>;
  remove(caseId: string, planId: string): Promise<void>;
}

export function openCaseRepository(): Promise<CaseRepository>;
```

If opening IndexedDB fails, return one process-local memory repository and expose `persistent: false`; do not swallow later transaction errors.

- [ ] **Step 4: Run focused and full foundation verification**

Run:

```powershell
npx vitest run tests/cases
npm run data:check-algorithm
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit persistence**

```powershell
git add src/features/cases/caseRepository.ts tests/cases/case-repository.test.ts
git commit -m "feat: persist imported algorithm cases"
```

## Plan 1 acceptance checkpoint

Before starting the UI plan, verify all of the following:

- `public/data/integration-cases/catalog.json` contains every latest valid built-in case and defaults to R10.
- R10 normalized metrics equal 2 UAVs, 5 sorties, 3 batches and 20 strips.
- A nested R10 ZIP converts to a bundle with the same authoritative metrics and source hash.
- No raw path under `data/integration-validation/`, `README.md`, or `traccar-web/` is staged.
- `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run data:check-algorithm`, and `npm run build` pass.
