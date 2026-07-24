# Algorithm Case 3D Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed three-UAV simulated workspace with a data-driven 3D mission workspace that plays every normalized sortie in algorithm order and supports local ZIP imports.

**Architecture:** Kepler 3.2.6 remains the basemap, camera and debug shell. A single Deck overlay state renders the algorithm task region, strips, static 3D routes, animated `TripsLayer` tails and world-aligned triangle markers; React owns one mission clock and one versioned layer preference object shared by every overlay.

**Tech Stack:** React 18, TypeScript 5.6, Redux 4.2, Kepler.gl 3.2.6, Deck.gl 8.9.36 (`GeoJsonLayer`, `PathLayer`, `TripsLayer`, `IconLayer`), Vitest, Testing Library, IndexedDB

---

**Prerequisites:** Complete `docs/superpowers/plans/2026-07-22-algorithm-case-data-import.md` and read `docs/superpowers/specs/2026-07-22-algorithm-case-import-3d-animation-design.md`. Preserve the user's modified `README.md`, untracked raw `data/`, and untracked `traccar-web/`.

## File map

- Create `src/features/mission/missionClock.ts`: pure task-clock reducer and status selectors.
- Create `src/features/mission/missionInterpolation.ts`: active sortie position, stage, speed, altitude and heading.
- Create `src/features/mission/missionLayerPreferences.ts`: four-layer state, dynamic UAV palette and local persistence.
- Create `src/features/mission/missionDeckLayers.ts`: region, strips, routes, Trip tails and triangle markers.
- Create `src/features/mission/caseMapState.ts`: case-centred 3D reset view.
- Create `src/hooks/useMissionClock.ts`: requestAnimationFrame lifecycle.
- Create `src/hooks/useCaseLibrary.ts`: built-in/imported case loading and switching.
- Create `src/components/workspace/MissionTimeline.tsx`: play, seek, rate, batch and active-count controls.
- Create `src/components/workspace/ImportCaseDialog.tsx`: worker progress, preview, overwrite and errors.
- Modify `src/components/kepler/UavMapContainer.tsx`: inject all mission Deck layers.
- Modify `src/components/WrjKeplerMap.tsx`: pass bundle, clock, scale, preferences and selection.
- Modify `src/components/Workspace.tsx`: case library orchestration and simplified shell.
- Modify `src/components/workspace/LayerSidebar.tsx`: four mission layers and dynamic UAV/sortie roster.
- Modify `src/components/workspace/DetailDrawer.tsx`: mission, UAV and sortie live details.
- Modify `src/index.css`: compact topbar, timeline, dialog, dynamic roster and 3D badges.
- Modify `src/kepler/constants.ts`: visual anchor and 3D defaults.
- Remove use of fixed `CaseSummary`, fixed six-layer Kepler injection and fixed UAV IDs from the active workspace; retain old files only until all migration tests pass.
- Create focused tests under `tests/mission/` and update existing workspace/map tests.

### Task 1: Create one dynamic mission layer preference model

**Files:**
- Create: `src/features/mission/missionLayerPreferences.ts`
- Create: `tests/mission/mission-layer-preferences.test.ts`

- [ ] **Step 1: Write failing preference and palette tests**

```ts
import {describe, expect, it} from "vitest";
import {
  createDefaultMissionLayerPreferences,
  loadMissionLayerPreferences,
  saveMissionLayerPreferences
} from "../../src/features/mission/missionLayerPreferences";

describe("mission layer preferences", () => {
  it("creates a deterministic color for every dynamic UAV", () => {
    const prefs = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04", "UAV-03"]);
    expect(Object.keys(prefs.uavColors)).toEqual(["UAV-03", "UAV-04"]);
    expect(prefs.uavColors["UAV-03"]).toMatch(/^#[0-9A-F]{6}$/);
    expect(prefs.uavColors["UAV-04"]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("uses one UAV palette for strips, routes, tails and markers", () => {
    const prefs = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]);
    prefs.uavColors["UAV-04"] = "#FF6600";
    expect(prefs.uavColors["UAV-04"]).toBe("#FF6600");
  });

  it("rejects wrong versions, invalid colors and out-of-range widths", () => {
    localStorage.setItem("wrj-mission-layer-preferences:v2:R10:PLAN-10", JSON.stringify({
      version: 1,
      uavColors: {"UAV-04": "orange"},
      layers: {routes: {visible: true, opacity: 2, width: 1000}}
    }));
    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toEqual(
      createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])
    );
  });
});
```

Also test save/load round trips, unknown UAV removal, new UAV default insertion, per-case storage keys and clearing defaults.

- [ ] **Step 2: Run the test and verify failure**

Run `npx vitest run tests/mission/mission-layer-preferences.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement types and defaults**

Use this public shape:

```ts
export type MissionLayerId = "region" | "strips" | "routes" | "trips";
export type VerticalScale = 1 | 2 | 4;

export interface MissionLayerPreference {
  visible: boolean;
  opacity: number;
  width?: number;
  trailLengthSec?: number;
  filled?: boolean;
  stroked?: boolean;
}

export interface MissionLayerPreferencesV2 {
  version: 2;
  caseId: string;
  planId: string;
  uavColors: Record<string, string>;
  markerSize: number;
  layers: Record<MissionLayerId, MissionLayerPreference>;
}
```

Defaults: region opacity `0.18`, strips `0.75` and width `2`, routes `0.55` and width `2`, trips `0.95`, width `4`, trail `240s`, marker size `30`. Clamp opacity to `0..1`, widths to `0.5..20`, trail to `0..3600`, marker size to `16..64`.

Create colors by sorting UAV IDs and assigning the stable palette `#35C5FF`, `#FFB44D`, `#4ED6A0`, `#B985FF`, `#FF6B7A`, `#4DDBD1`, then derive additional HSL colors from a deterministic string hash. Normalize every saved color to uppercase `#RRGGBB`.

- [ ] **Step 4: Run tests and commit**

Run `npx vitest run tests/mission/mission-layer-preferences.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/mission/missionLayerPreferences.ts tests/mission/mission-layer-preferences.test.ts
git commit -m "feat: add dynamic mission layer preferences"
```

### Task 2: Implement the global mission clock

**Files:**
- Create: `src/features/mission/missionClock.ts`
- Create: `src/hooks/useMissionClock.ts`
- Create: `tests/mission/mission-clock.test.ts`

- [ ] **Step 1: Write failing pure-clock tests**

```ts
import {describe, expect, it} from "vitest";
import {advanceMissionClock, createMissionClock, seekMissionClock} from "../../src/features/mission/missionClock";

describe("mission clock", () => {
  it("advances by real delta multiplied by playback rate", () => {
    const state = {...createMissionClock(3_598.185), playing: true, rate: 30 as const};
    expect(advanceMissionClock(state, 1_000).missionTimeSec).toBe(30);
  });

  it("clamps at makespan and stops", () => {
    const state = {...createMissionClock(100), missionTimeSec: 99, playing: true, rate: 10 as const};
    expect(advanceMissionClock(state, 1_000)).toMatchObject({missionTimeSec: 100, playing: false});
  });

  it("supports exact seeking without changing algorithm time", () => {
    expect(seekMissionClock(createMissionClock(3_598.185), 1_206.801).missionTimeSec).toBe(1_206.801);
  });
});
```

Also test pause, replay from the end, rate options `1 | 10 | 30 | 60`, negative delta rejection and resetting when the case key changes.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/mission/mission-clock.test.ts`.

Expected: FAIL because the clock module is missing.

- [ ] **Step 3: Implement the pure reducer**

```ts
export type PlaybackRate = 1 | 10 | 30 | 60;

export interface MissionClockState {
  missionTimeSec: number;
  makespanSec: number;
  playing: boolean;
  rate: PlaybackRate;
}

export function advanceMissionClock(state: MissionClockState, elapsedMs: number): MissionClockState {
  if (!state.playing) return state;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError("elapsedMs 必须为非负有限数值");
  const next = Math.min(state.makespanSec, state.missionTimeSec + elapsedMs / 1000 * state.rate);
  return {...state, missionTimeSec: next, playing: next < state.makespanSec};
}
```

- [ ] **Step 4: Implement `useMissionClock`**

Use one `requestAnimationFrame` loop, store the previous frame timestamp in a ref, dispatch elapsed deltas into the pure reducer, cancel the frame on unmount/case change, and expose `play`, `pause`, `toggle`, `seek`, `setRate`, and `restart`. The hook must reset to time 0 and auto-play when `caseKey` changes.

- [ ] **Step 5: Run tests and commit**

Run `npx vitest run tests/mission/mission-clock.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/mission/missionClock.ts src/hooks/useMissionClock.ts tests/mission/mission-clock.test.ts
git commit -m "feat: add algorithm mission clock"
```

### Task 3: Interpolate active sorties, telemetry and heading

**Files:**
- Create: `src/features/mission/missionInterpolation.ts`
- Create: `tests/mission/mission-interpolation.test.ts`

- [ ] **Step 1: Write failing execution-order tests**

Create normalized R10-like sorties and assert:

```ts
expect(selectSortieStates(sorties, -1).every(({status}) => status === "waiting")).toBe(true);
expect(selectSortieStates(sorties, 0).filter(({status}) => status === "flying")).toHaveLength(2);
expect(selectSortieStates(sorties, 1_206.8).filter(({status}) => status === "flying")).toHaveLength(0);
expect(selectSortieStates(sorties, 1_206.801).filter(({status}) => status === "flying")).toHaveLength(2);
expect(selectSortieStates(sorties, 2_415.788).filter(({status}) => status === "flying")).toHaveLength(1);
```

Add tests that CLIMB interpolates altitude from 0 to 2900 at fixed longitude/latitude, displayed speed equals the segment's `speedMps`, TURN heading follows the current pair of non-identical points, vertical segments retain the previous valid heading, and the marker has a three-second `landed` fade before becoming hidden.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/mission/mission-interpolation.test.ts`.

Expected: FAIL because mission interpolation does not exist.

- [ ] **Step 3: Implement binary-search interpolation**

Export:

```ts
export type SortieStatus = "waiting" | "flying" | "landed" | "completed";

export interface LiveSortieState {
  assignmentId: string;
  uavId: string;
  batchIndex: number;
  status: SortieStatus;
  position: readonly [number, number, number] | null;
  localPosition: LocalPoint | null;
  headingDeg: number | null;
  segmentType: SegmentType | null;
  stripId: string | null;
  altitudeM: number;
  speedMps: number;
}

export function selectSortieStates(sorties: readonly NormalizedSortie[], missionTimeSec: number): LiveSortieState[];
```

Binary-search `TimedSegment` ranges, then binary-search `timedPath`. Interpolate longitude, latitude and true altitude by timestamp ratio, and interpolate the paired `localPath` at the same ratio into `localPosition`. Search backwards and forwards for the nearest non-identical horizontal pair before calculating a clockwise-from-north bearing. Never derive `speedMps` from playback motion.

- [ ] **Step 4: Run tests and commit**

Run `npx vitest run tests/mission/mission-interpolation.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/features/mission/missionInterpolation.ts tests/mission/mission-interpolation.test.ts
git commit -m "feat: interpolate algorithm sortie telemetry"
```

### Task 4: Render all mission geometry as synchronized 3D Deck layers

**Files:**
- Create: `public/assets/uav-triangle-mask.svg`
- Create: `src/features/mission/missionDeckLayers.ts`
- Create: `tests/mission/mission-deck-layers.test.ts`

- [ ] **Step 1: Add the code-native triangle asset**

Create `public/assets/uav-triangle-mask.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path fill="#fff" d="M32 4 57 56 32 46 7 56Z"/>
</svg>
```

The point at `(32,4)` is the nose. Keep the asset monochrome and use Deck mask coloring.

- [ ] **Step 2: Write failing layer tests**

Assert the returned layer IDs are exactly:

```ts
expect(layers.map(({id}) => id)).toEqual([
  "wrj-algorithm-region",
  "wrj-algorithm-strips",
  "wrj-algorithm-routes",
  "wrj-algorithm-trips",
  "wrj-algorithm-uav-triangles"
]);
```

Inspect layer props to verify:

- routes and Trips paths multiply only altitude by `verticalScale`;
- region and strips remain at altitude 0;
- `TripsLayer.currentTime` equals the global mission time;
- `TripsLayer.getTimestamps` returns the fourth coordinate;
- the marker color equals the corresponding UAV route color;
- waiting/completed sorties have no marker;
- marker positions multiply true altitude by `verticalScale`;
- `billboard` is `false`, triangle size is configurable, and angle uses the live heading;
- widths, opacities, visibility and trail length come from one preference object.

- [ ] **Step 3: Verify failure**

Run `npx vitest run tests/mission/mission-deck-layers.test.ts`.

Expected: FAIL because `missionDeckLayers.ts` is missing.

- [ ] **Step 4: Implement the five-layer factory**

Export:

```ts
export interface MissionDeckLayerOptions {
  bundle: CaseBundleV2;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV2;
  onSelectSortie?: (assignmentId: string) => void;
}

export function createMissionDeckLayers(options: MissionDeckLayerOptions): Layer[];
```

Use `PolygonLayer` for the region, `PathLayer` for strip centre lines and routes, `TripsLayer` for animated tails, and `IconLayer` for triangle markers. Memoization belongs in React context/provider code; keep this factory pure. Set paths and markers `pickable: true`, return `assignmentId` in picking info, and use `onClick` only when `onSelectSortie` is provided.

For `verticalScale`, map `[lon, lat, altitude, time]` to `[lon, lat, altitude * verticalScale, time]` without mutating `CaseBundleV2`.

- [ ] **Step 5: Run tests and commit**

Run `npx vitest run tests/mission/mission-deck-layers.test.ts` and `npm run typecheck`.

Expected: PASS.

```powershell
git add public/assets/uav-triangle-mask.svg src/features/mission/missionDeckLayers.ts tests/mission/mission-deck-layers.test.ts
git commit -m "feat: render synchronized 3d mission layers"
```

### Task 5: Inject the mission overlay into Kepler without dataset reinjection

**Files:**
- Modify: `src/components/kepler/UavMapContainer.tsx`
- Modify: `src/components/WrjKeplerMap.tsx`
- Create: `src/features/mission/caseMapState.ts`
- Modify: `src/kepler/constants.ts`
- Modify: `tests/wrj-kepler-map.test.tsx`
- Modify: `tests/uav-deck-layers.test.ts`

- [ ] **Step 1: Replace fixed-flight overlay tests with bundle overlay tests**

Update tests to assert `WrjKeplerMap` provides one overlay value containing `bundle`, `missionTimeSec`, `verticalScale`, `preferences`, and selection callback. Assert `mergeDeckRenderCallbacks` preserves existing Kepler layers and appends five mission layers once.

Add a reset-view test:

```ts
expect(caseMapState(bundle)).toMatchObject({
  latitude: 18.625,
  longitude: 110.235,
  pitch: 55,
  bearing: -18,
  dragRotate: true
});
expect(caseMapState(bundle).zoom).toBeGreaterThanOrEqual(4);
expect(caseMapState(bundle).zoom).toBeLessThanOrEqual(14);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npx vitest run tests/wrj-kepler-map.test.tsx tests/uav-deck-layers.test.ts
```

Expected: FAIL against the old fixed `FlightOverlayValue`.

- [ ] **Step 3: Replace overlay context and callbacks**

Define:

```ts
export interface MissionOverlayValue {
  bundle: CaseBundleV2 | null;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV2 | null;
  onSelectSortie?: (assignmentId: string) => void;
}
```

`UavMapContainerFactory` must call `createMissionDeckLayers` only when bundle and preferences are non-null, append the result to existing Deck layers, and preserve a `null` result returned by Kepler's original callback.

- [ ] **Step 4: Implement a case-aware reset state**

`caseMapState(bundle)` uses the display anchor as centre, `pitch: 55`, `bearing: -18`, and computes zoom from the horizontal map bounds using a bounded logarithmic extent formula. It must ignore altitude when calculating zoom and use zoom 12 when the horizontal extent is zero.

- [ ] **Step 5: Run tests and commit**

Run the focused tests plus `npm run typecheck`.

Expected: PASS.

```powershell
git add src/components/kepler/UavMapContainer.tsx src/components/WrjKeplerMap.tsx src/features/mission/caseMapState.ts src/kepler/constants.ts tests/wrj-kepler-map.test.tsx tests/uav-deck-layers.test.ts
git commit -m "feat: integrate 3d mission overlay with kepler"
```

### Task 6: Load and switch built-in and imported cases

**Files:**
- Create: `src/hooks/useCaseLibrary.ts`
- Create: `tests/mission/use-case-library.test.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `tests/workspace.test.tsx`

- [ ] **Step 1: Write failing case-library tests**

Mock catalog and repository APIs and assert:

- built-in and imported entries are merged and labelled by source;
- R10 is selected initially when present;
- missing R10 selects the first catalog entry;
- switching aborts the previous HTTP load;
- selecting an imported entry reads IndexedDB rather than HTTP;
- deleting the selected imported case returns to R10;
- duplicate StrictMode effects produce one effective load for a case key;
- a failed switch leaves the previous valid bundle visible and reports the new error.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/mission/use-case-library.test.tsx`.

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement `useCaseLibrary`**

Expose:

```ts
export interface CaseLibraryState {
  entries: CaseLibraryEntry[];
  selectedKey: string | null;
  bundle: CaseBundleV2 | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  persistentImports: boolean;
  select(key: string): void;
  refreshImports(): Promise<void>;
  deleteImported(key: string): Promise<void>;
}
```

Use `caseId:planId:source` as the stable key. Keep the previous bundle until a newly selected bundle validates successfully. Abort stale loads and use a generation counter to ignore late promises.

- [ ] **Step 4: Begin Workspace migration**

Replace the fixed `loadCase("riyue-3d")`, fixed `CaseSummary`, CSV extraction, Kepler dataset injection key and fixed UAV color mapping with `useCaseLibrary`, `useMissionClock`, and mission preferences keyed by the selected case/plan. Keep loading, retry, Escape and `R` behaviour.

Do not remove old files in this task; first make updated workspace tests pass with the new props.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run tests/mission/use-case-library.test.tsx tests/workspace.test.tsx
npm run typecheck
```

Expected: PASS for migrated loading/switching tests.

```powershell
git add src/hooks/useCaseLibrary.ts src/components/Workspace.tsx tests/mission/use-case-library.test.tsx tests/workspace.test.tsx
git commit -m "feat: switch dynamic algorithm cases"
```

### Task 7: Build the dynamic sidebar and mission timeline

**Files:**
- Modify: `src/components/workspace/LayerSidebar.tsx`
- Create: `src/components/workspace/MissionTimeline.tsx`
- Create: `tests/mission/mission-sidebar.test.tsx`
- Create: `tests/mission/mission-timeline.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write failing sidebar tests**

Assert four layer rows in exact order: 算法任务区、侦察条带、静态规划航迹、动态飞行尾迹. Assert no 真实 POI or 真实上下文 rows.

Provide R10 roster data and assert two entity UAV groups and five assignment rows. At time 0, two rows say 飞行中; at 1206.8 they are completed/waiting; at 1206.801 the next two say 飞行中. Test UAV color editing updates the shared palette used by routes and markers, while layer width controls remain independent.

- [ ] **Step 2: Write failing timeline tests**

Test play/pause, range seek, exact rate options, formatted task time, current batch, active sortie count and keyboard accessibility. Required labels:

```ts
expect(screen.getByRole("button", {name: "暂停任务动画"})).toBeInTheDocument();
expect(screen.getByLabelText("任务时间轴")).toHaveValue("1206.801");
expect(screen.getByText("第 2 批")).toBeInTheDocument();
expect(screen.getByText("2 架飞行中")).toBeInTheDocument();
```

- [ ] **Step 3: Verify both tests fail**

Run:

```powershell
npx vitest run tests/mission/mission-sidebar.test.tsx tests/mission/mission-timeline.test.tsx
```

Expected: FAIL against the fixed three-UAV sidebar and missing timeline.

- [ ] **Step 4: Refactor `LayerSidebar`**

Replace `UavId` unions and fixed `UAV_IDS` with strings from the current bundle. Render one shared UAV palette editor and four layer editors. Region supports fill/stroke; strips/routes support width; trips support width, trail and marker size. Roster groups assignments by `uavId`, sorts children by launch time, and calls `onSelectUav(uavId)` or `onSelectSortie(assignmentId)`.

- [ ] **Step 5: Implement `MissionTimeline`**

The component is controlled by `MissionClockState`; it never computes algorithm speed. Determine current batch from assignments whose launch time is less than or equal to mission time, and active count from `LiveSortieState`. Use a range input step of `0.001` seconds and display both formatted `HH:MM:SS` and raw mission seconds in the accessible value text.

- [ ] **Step 6: Wire both components and commit**

Run focused tests and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/components/workspace/LayerSidebar.tsx src/components/workspace/MissionTimeline.tsx src/components/Workspace.tsx tests/mission/mission-sidebar.test.tsx tests/mission/mission-timeline.test.tsx
git commit -m "feat: add dynamic mission controls"
```

### Task 8: Replace fixed details with live overview, UAV and sortie drawers

**Files:**
- Modify: `src/components/workspace/DetailDrawer.tsx`
- Modify: `src/components/Workspace.tsx`
- Create: `tests/mission/mission-detail-drawer.test.tsx`

- [ ] **Step 1: Write failing drawer tests**

Test three content forms:

```ts
export type DrawerContent =
  | {type: "overview"}
  | {type: "uav"; uavId: string}
  | {type: "sortie"; assignmentId: string}
  | null;
```

Overview assertions: 2 UAVs, 5 sorties, 3 batches, 20 strips, coverage, makespan, total distance, total fuel and validation warnings.

UAV assertions: all assignments for that UAV, cumulative distance/fuel and current status.

Sortie assertions at a CLIMB time: assignment, entity UAV, batch, launch time, CLIMB, original local X/Y/Z, true height, true speed, strip IDs and fuel. Verify `2×/4×` vertical scale never changes displayed local coordinates or true height.

Every rendered drawer must include the exact coordinate notice:

```text
算法数据采用 LOCAL_CARTESIAN_M；当前地图位置为日月湾视觉锚定，不代表真实地理定位。
```

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/mission/mission-detail-drawer.test.tsx`.

Expected: FAIL against the fixed `CaseSummary` drawer.

- [ ] **Step 3: Implement data-driven details**

Accept `bundle`, `liveSorties`, `missionTimeSec`, `content`, attribution and close callback. Use normalized metrics without recomputing coverage/makespan/distance/fuel. Only aggregate per-UAV assignment totals from normalized sorties. Preserve focus restoration, non-modal map interaction and Escape close.

- [ ] **Step 4: Wire marker/roster selection and commit**

Clicking a Deck route/tail/triangle opens the sortie drawer. Clicking a roster entity opens UAV details. Map drag, zoom and rotate do not close the drawer.

Run focused tests and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/components/workspace/DetailDrawer.tsx src/components/Workspace.tsx tests/mission/mission-detail-drawer.test.tsx
git commit -m "feat: show live algorithm mission details"
```

### Task 9: Add fixed-format ZIP import UI

**Files:**
- Create: `src/components/workspace/ImportCaseDialog.tsx`
- Create: `src/hooks/useCaseImport.ts`
- Create: `tests/mission/import-case-dialog.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write failing import dialog tests**

Mock Worker and repository. Test:

- only `.zip` files are accepted;
- progress stages display 解压、校验、转换、保存;
- preview shows case ID, UAVs, sorties, batches, strips, duration and warnings;
- confirmation saves and switches to the new case;
- duplicate `caseId + planId` requires explicit overwrite;
- cancel posts a typed cancel request and closes without changing the active case;
- worker failure shows stage/source/field reason and permits retry;
- repository fallback displays “仅当前会话有效，刷新后不会保留”;
- a failed import leaves the currently playing case and clock untouched.

- [ ] **Step 2: Verify failure**

Run `npx vitest run tests/mission/import-case-dialog.test.tsx`.

Expected: FAIL because the dialog and hook do not exist.

- [ ] **Step 3: Implement `useCaseImport`**

Create the worker with:

```ts
new Worker(new URL("../features/cases/import.worker.ts", import.meta.url), {type: "module"});
```

Use a unique request ID, transfer `await file.arrayBuffer()`, ignore responses for stale requests, terminate the worker on unmount, expose typed progress/preview/error state, and save only after explicit confirmation.

- [ ] **Step 4: Implement the dialog**

Use a native file input plus drop zone, no upload/network language, and label the action “本地导入算例”. Disable confirmation until conversion succeeds. Show source ZIP name and the permanent coordinate disclaimer in preview. If overwrite is required, present an unchecked confirmation checkbox before enabling save.

- [ ] **Step 5: Wire import/delete actions and commit**

After save, call `caseLibrary.refreshImports()` and select the new key. Imported entries expose a delete action with case/plan confirmation; built-ins do not.

Run focused tests and `npm run typecheck`.

Expected: PASS.

```powershell
git add src/components/workspace/ImportCaseDialog.tsx src/hooks/useCaseImport.ts src/components/Workspace.tsx tests/mission/import-case-dialog.test.tsx
git commit -m "feat: import algorithm cases from zip"
```

### Task 10: Finish the compact 3D workspace and remove fixed-case runtime paths

**Files:**
- Modify: `src/components/Workspace.tsx`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `tests/app.test.tsx`
- Modify: `tests/workspace.test.tsx`
- Modify: `tests/workspace-panels.test.tsx`
- Delete after migration: `src/features/flight/flightPaths.ts`
- Delete after migration: `src/features/flight/flightInterpolation.ts`
- Delete after migration: `src/features/flight/uavDeckLayers.ts`
- Delete after migration: tests that only assert the old fixed CSV flight path contract

- [ ] **Step 1: Update shell-level failing tests**

Assert the ready workspace contains:

- compact title and dynamic case selector;
- R10 selected by default;
- validity/warning badge;
- import button;
- public/local basemap controls;
- height buttons `1×`, `2×`, `4×` with `1×` selected initially;
- reset 3D view and overview buttons;
- four-layer sidebar;
- compact timeline;
- permanent visual-anchor notice.

Assert it does not contain the old six metrics row, real POI/context controls, fixed three-UAV assumptions, fixed bottom task-stage strip, upload-to-server language, or fixed right panel.

- [ ] **Step 2: Verify test failure**

Run:

```powershell
npx vitest run tests/app.test.tsx tests/workspace.test.tsx tests/workspace-panels.test.tsx
```

Expected: FAIL until the migration is complete.

- [ ] **Step 3: Complete Workspace state flow**

Use `useMemo` for scaled layer inputs and live sortie selectors. Height changes update only `verticalScale`; they must not replace `bundle`, reset `MissionClockState` or reload the case. Case switches reset clock and view. `R` resets the current case 3D view unless focus is in an editable control; Escape closes dialog first, then drawer.

- [ ] **Step 4: Apply compact desktop styling**

Keep the 60px topbar, 300px/44px collapsible left sidebar, full map and overlay drawer. Place timeline above the map bottom edge with enough offset for Kepler attribution. Support 1920×1080 and 1366×768 using spacing/font reductions only; do not add a mobile layout.

Ensure the coordinate notice is compact but always visible, and OSM/Mapbox/local attribution remains available through the details/footer already used by the project.

The overview must state that the public/satellite basemap is planar unless a configured DEM source is present; do not label the basemap itself as true 3D terrain.

- [ ] **Step 5: Remove obsolete active-path code**

After all migrated tests pass, remove old CSV extraction and fixed icon modules, their unused imports and tests. Keep old generated `public/data/riyue-3d` only if another documented compatibility path still references it; otherwise remove it in a separate commit after `rg "riyue-3d|wrj-simulated" src tests` returns no active references.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npx vitest run tests/app.test.tsx tests/workspace.test.tsx tests/workspace-panels.test.tsx tests/mission
npm run typecheck
```

Expected: PASS.

```powershell
git add src tests public/assets/uav-triangle-mask.svg
git commit -m "feat: complete data driven 3d mission workspace"
```

Before committing, run `git diff --cached --name-only` and unstage any user-owned `README.md`, raw `data/`, or `traccar-web/` path.

### Task 11: Add R10 integration checks and browser acceptance

**Files:**
- Create: `tests/mission/r10-integration.test.ts`
- Modify: `docs/P0_VALIDATION.md`
- Create: `docs/ALGORITHM_CASE_VALIDATION.md`

- [ ] **Step 1: Add R10 golden integration assertions**

Load committed `public/data/integration-cases/catalog.json` and the R10 bundle. Assert:

```ts
expect(bundle.metrics).toMatchObject({
  uavCount: 2,
  sortieCount: 5,
  batchCount: 3,
  stripCount: 20,
  missionMakespanSec: 3_598.185
});
expect([...new Set(bundle.sorties.map(({plannedLaunchTimeSec}) => plannedLaunchTimeSec))])
  .toEqual([0, 1_206.801, 2_415.788]);
expect(Math.max(...bundle.sorties.flatMap(({segments}) => segments.map(({heightM}) => heightM))))
  .toBe(2_900);
expect(Math.max(...bundle.sorties.flatMap(({segments}) => segments.map(({speedMps}) => speedMps))))
  .toBe(223.702);
```

Assert all 20 strip IDs have one assignment/UAV owner, every sortie ends no later than makespan tolerance `1e-3`, and every timed path is monotonic.

- [ ] **Step 2: Run all automated verification**

Run:

```powershell
npm run data:check-algorithm
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: every command exits 0. Record test file/test counts and build output size in `docs/ALGORITHM_CASE_VALIDATION.md`.

- [ ] **Step 3: Start local preview with a bounded command**

Run `npm run dev -- --host 127.0.0.1` in a background process, record the selected port, and verify the root URL returns HTTP 200. Do not wait on a foreground command for more than 60 seconds.

- [ ] **Step 4: Validate R10 in Chrome/Edge at both target sizes**

At 1920×1080 and 1366×768 verify:

1. R10 loads by default with 2 UAVs, 5 sorties, 3 batches and 20 strips.
2. Region and all strips are visible at sea level.
3. Static routes, Trip tails and triangles are visibly elevated at 3D pitch.
4. Two triangles appear at task time 0, two at 1206.801s, and one at 2415.788s.
5. Triangle nose follows ENTRY, TURN, COVERAGE and RETURN direction.
6. CLIMB/DESCENT altitude changes while horizontal position remains fixed.
7. Live values reach 2900m and 223.702m/s.
8. `1×/2×/4×` changes visual height for routes, tails and triangles together without changing displayed true altitude or current task time.
9. Color, opacity, widths, trail length and marker size update without restarting animation.
10. Case switching, pause, seek, rate, reset view, drawer and Escape work.

- [ ] **Step 5: Validate ZIP import and failure recovery**

Create one R10 ZIP from the selected run directory without modifying its contents. Import it, inspect the preview, confirm overwrite behaviour, refresh and verify IndexedDB restoration, then delete it. Also test a ZIP with no `mission_plan.json`, a ZIP with two such files, and an infeasible plan; each must leave the current case playing and show the exact reason.

- [ ] **Step 6: Record evidence and commit validation docs**

Document browser versions, resolutions, selected data source path, coordinate anchoring limitation, warnings, commands, outcomes and any accepted limitations.

```powershell
git add tests/mission/r10-integration.test.ts docs/P0_VALIDATION.md docs/ALGORITHM_CASE_VALIDATION.md
git commit -m "test: validate algorithm driven 3d mission demo"
```

## Plan 2 acceptance checkpoint

- All built-in valid cases are selectable and R10 is default.
- Future single-case ZIP packages import locally and survive refresh when IndexedDB is available.
- R10 launches sorties in exact algorithm batch order and shows algorithm height/speed.
- Region, strip division, static routes, animated tails and world-aligned triangles render in 3D.
- Triangle color always matches the shared UAV route/tail color.
- Width controls exist for strips, routes and tails.
- Height scale affects routes, tails and markers together without changing true values or mission time.
- The permanent visual-anchor disclaimer is always visible.
- No user-owned raw data or unrelated working-tree change is staged.
