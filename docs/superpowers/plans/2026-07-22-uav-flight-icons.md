# UAV Flight Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render three tintable fixed-wing UAV SVG markers that follow the three Kepler Trip paths, headings, playback time, visibility, colors, and a persisted 16–64 px size control.

**Architecture:** Parse the already loaded Trip CSV once into validated paths, interpolate positions with pure functions, and inject an additional non-pickable `IconLayer` into Kepler's existing Deck.gl canvas through a custom `MapContainerFactory`. Kepler remains the only source for playback time, Trip visibility, and the three-color ordinal palette; only marker size is WRJ-specific persisted UI state.

**Tech Stack:** React 18, TypeScript, Kepler.gl 3.2.6 component injection, Deck.gl 8.9.36 `IconLayer`, Redux, Vitest, Testing Library, SVG.

---

## File map

- Create `public/assets/uav-fixed-wing-mask.svg`: monochrome scalable aircraft mask.
- Create `src/features/flight/flightPaths.ts`: Trip CSV extraction and runtime validation.
- Create `src/features/flight/flightInterpolation.ts`: time interpolation and geographic heading.
- Create `src/features/flight/uavDeckLayers.ts`: current marker data and Deck.gl icon layer construction.
- Create `src/components/kepler/UavMapContainer.tsx`: Kepler factory replacement that appends marker layers.
- Modify `src/components/WrjKeplerMap.tsx`: provide paths/size to the injected Kepler component.
- Modify `src/components/Workspace.tsx`: extract paths, own marker size, restore/persist defaults, pass map props.
- Modify `src/components/workspace/LayerSidebar.tsx`: render the Trip marker-size range input.
- Modify `src/features/layers/layerPreferences.ts`: validate and persist Trip `iconSize` only.
- Modify `package.json` and `package-lock.json`: declare the already compatible `@deck.gl/layers` 8.9.36 direct dependency.
- Create `tests/flight-paths.test.ts`, `tests/flight-interpolation.test.ts`, `tests/uav-deck-layers.test.ts`.
- Modify `tests/workspace-panels.test.tsx`, `tests/layer-preferences.test.ts`, `tests/wrj-kepler-map.test.tsx`, `tests/workspace.test.tsx`.

### Task 1: Declare Deck.gl and add the tintable SVG mask

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `public/assets/uav-fixed-wing-mask.svg`
- Test: `tests/uav-deck-layers.test.ts`

- [ ] **Step 1: Probe configured temporary registries and declare the installed-compatible dependency**

Run short `npm ping --registry <candidate>` checks with a 10-second limit, then use the first reachable temporary registry:

```powershell
npm install --save-exact @deck.gl/layers@8.9.36 --registry <reachable-registry>
```

Expected: `package.json` contains `"@deck.gl/layers": "8.9.36"`; no global or project registry setting is changed.

- [ ] **Step 2: Write the failing SVG contract test**

```ts
import {readFileSync} from "node:fs";
import {expect, it} from "vitest";

it("ships a monochrome scalable fixed-wing mask", () => {
  const svg = readFileSync("public/assets/uav-fixed-wing-mask.svg", "utf8");
  expect(svg).toContain('viewBox="0 0 64 64"');
  expect(svg).toContain('fill="#ffffff"');
  expect(svg).not.toMatch(/#35C5FF|#FFB44D|#4ED6A0/i);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm run test:run -- tests/uav-deck-layers.test.ts`

Expected: FAIL because `public/assets/uav-fixed-wing-mask.svg` does not exist.

- [ ] **Step 4: Create the SVG mask**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="高速固定翼无人机">
  <path fill="#ffffff" d="M32 3 38 22 58 31 58 37 38 34 42 53 35 49 32 61 29 49 22 53 26 34 6 37 6 31 26 22Z"/>
  <path fill="#ffffff" d="M29 18h6l3 22-6 9-6-9Z" opacity=".72"/>
</svg>
```

- [ ] **Step 5: Run the test and commit**

Run: `npm run test:run -- tests/uav-deck-layers.test.ts`

Expected: PASS.

```powershell
git add package.json package-lock.json public/assets/uav-fixed-wing-mask.svg tests/uav-deck-layers.test.ts
git commit -m "feat: add tintable UAV marker asset"
```

### Task 2: Extract and interpolate the three Trip paths

**Files:**
- Create: `src/features/flight/flightPaths.ts`
- Create: `src/features/flight/flightInterpolation.ts`
- Create: `tests/flight-paths.test.ts`
- Create: `tests/flight-interpolation.test.ts`

- [ ] **Step 1: Write failing parser tests**

Test the real `public/data/riyue-3d/simulated/trips.csv` and malformed fixtures:

```ts
const paths = extractFlightPaths(tripCsv);
expect(paths.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);
for (const path of paths) {
  expect(path.coordinates.length).toBeGreaterThan(2);
  expect(path.coordinates.every((point, index) => index === 0 || point[3] > path.coordinates[index - 1][3])).toBe(true);
}
expect(extractFlightPaths("_geojson,uav_id\r\ninvalid,UAV-01")).toEqual([]);
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm run test:run -- tests/flight-paths.test.ts`

Expected: FAIL because `extractFlightPaths` is missing.

- [ ] **Step 3: Implement typed extraction through `processCsvData`**

```ts
export type UavFlightId = "UAV-01" | "UAV-02" | "UAV-03";
export type FlightCoordinate = readonly [longitude: number, latitude: number, altitude: number, timestamp: number];
export interface UavFlightPath {uavId: UavFlightId; coordinates: FlightCoordinate[]}

export function extractFlightPaths(raw: string): UavFlightPath[] {
  const processed = processCsvData(raw);
  if (!processed) return [];
  const geoIndex = processed.fields.findIndex(({name}) => name === "_geojson");
  const uavIndex = processed.fields.findIndex(({name}) => name === "uav_id");
  if (geoIndex < 0 || uavIndex < 0) return [];
  return processed.rows.flatMap((row) => normalizeRow(row[geoIndex], row[uavIndex]));
}
```

`normalizeRow` must JSON-parse the Feature string, accept only the three fixed UAV IDs and a `LineString`, reject non-finite/out-of-range coordinates, require at least two points, and require strictly increasing timestamps.

- [ ] **Step 4: Write failing interpolation tests**

```ts
expect(interpolateFlight(path, 50)).toMatchObject({position: [5, 10, 50]});
expect(interpolateFlight(path, -1)?.position).toEqual(path.coordinates[0].slice(0, 3));
expect(interpolateFlight(path, 999)?.position).toEqual(path.coordinates.at(-1)?.slice(0, 3));
expect(interpolateFlight(eastboundPath, 5)?.heading).toBeCloseTo(90, 3);
```

- [ ] **Step 5: Implement binary-search interpolation and bearing**

`interpolateFlight(path, time)` returns `{uavId, position, heading}`. Clamp time to endpoints, binary-search adjacent points, linearly interpolate longitude/latitude/altitude, and calculate initial bearing with:

```ts
const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
const x = Math.cos(latitude1) * Math.sin(latitude2) -
  Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude);
const heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
```

- [ ] **Step 6: Run both test files and commit**

Run: `npm run test:run -- tests/flight-paths.test.ts tests/flight-interpolation.test.ts`

Expected: PASS.

```powershell
git add src/features/flight tests/flight-paths.test.ts tests/flight-interpolation.test.ts
git commit -m "feat: derive animated positions from Trip paths"
```

### Task 3: Build and inject the three Deck.gl marker layers

**Files:**
- Create: `src/features/flight/uavDeckLayers.ts`
- Create: `src/components/kepler/UavMapContainer.tsx`
- Modify: `src/components/WrjKeplerMap.tsx`
- Test: `tests/uav-deck-layers.test.ts`
- Modify: `tests/wrj-kepler-map.test.tsx`

- [ ] **Step 1: Write failing layer-construction tests**

Assert that `createUavDeckLayers` returns no layers when Trip is hidden, and otherwise returns one non-pickable masked IconLayer containing three records. Call its accessors and verify `[53,197,255,255]`, `[255,180,77,255]`, `[78,214,160,255]`, individual headings, `/assets/uav-fixed-wing-mask.svg`, and size 32.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:run -- tests/uav-deck-layers.test.ts`

Expected: FAIL because `createUavDeckLayers` is missing.

- [ ] **Step 3: Implement marker layer construction**

```ts
return [new IconLayer<FlightMarker>({
  id: "wrj-uav-flight-markers",
  data: markers,
  pickable: false,
  billboard: true,
  sizeUnits: "pixels",
  getPosition: ({position}) => position,
  getAngle: ({heading}) => heading,
  getColor: ({color}) => [...hexToRgb(color), 255],
  getSize: iconSize,
  getIcon: () => ({url: "/assets/uav-fixed-wing-mask.svg", width: 64, height: 64, anchorY: 32, mask: true}),
  updateTriggers: {getColor: palette, getSize: iconSize}
})];
```

- [ ] **Step 4: Inject the layer into Kepler's existing Deck canvas**

Create `FlightOverlayContext` carrying `{paths, iconSize}`. Implement `UavMapContainerFactory` with the same dependencies as `MapContainerFactory`; wrap the original component and compose `deckRenderCallbacks.onDeckRender` so it preserves existing props/layers and appends `createUavDeckLayers(...)`. Read `visState.animationConfig.currentTime`, `wrj-trip-layer.config.isVisible`, and its ordinal `colorRange.colors` from the wrapper props.

Create the injected component once at module scope:

```ts
export const WrjKeplerGl = injectComponents([
  [MapContainerFactory, UavMapContainerFactory]
]);
```

In `WrjKeplerMap`, provide context and render `WrjKeplerGl`. Extend props with `flightPaths?: readonly UavFlightPath[]` and `uavIconSize?: number`, defaulting to `[]` and `32`.

- [ ] **Step 5: Verify map component behavior and commit**

Run: `npm run test:run -- tests/uav-deck-layers.test.ts tests/wrj-kepler-map.test.tsx`

Expected: PASS; existing Kepler id, dimensions and basemap props remain unchanged.

```powershell
git add src/features/flight/uavDeckLayers.ts src/components/kepler/UavMapContainer.tsx src/components/WrjKeplerMap.tsx tests/uav-deck-layers.test.ts tests/wrj-kepler-map.test.tsx
git commit -m "feat: render synchronized UAV markers in Kepler"
```

### Task 4: Add the persisted Trip icon-size control

**Files:**
- Modify: `src/components/workspace/LayerSidebar.tsx`
- Modify: `src/features/layers/layerPreferences.ts`
- Modify: `src/components/Workspace.tsx`
- Modify: `tests/workspace-panels.test.tsx`
- Modify: `tests/layer-preferences.test.ts`
- Modify: `tests/workspace.test.tsx`

- [ ] **Step 1: Write failing UI and persistence tests**

Add `iconSize?: number` to test appearances/preferences. Open Trip advanced settings, assert a range input labelled `模拟 Trip 无人机图标大小` with `min="16"`, `max="64"`, value `32`, and assert changing it calls `onLayerChange("wrj-trip-layer", {iconSize: 48})`. Verify preferences accept Trip `iconSize: 48`, reject 15/65, and remove `iconSize` from all non-Trip layers.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:run -- tests/workspace-panels.test.tsx tests/layer-preferences.test.ts tests/workspace.test.tsx`

Expected: FAIL because `iconSize` is unsupported.

- [ ] **Step 3: Add the sidebar control and sanitizer**

Extend `LayerAppearance` and `LayerPreference` with `iconSize?: number`. In `LayerEditor`, show the control only when `layer.id === "wrj-trip-layer"`:

```tsx
<input
  aria-label={`${label} 无人机图标大小`}
  type="range"
  min="16"
  max="64"
  step="1"
  value={appearance.iconSize ?? 32}
  onChange={(event) => onChange({iconSize: event.currentTarget.valueAsNumber})}
/>
```

In preference sanitization, accept `iconSize` only for `wrj-trip-layer` and only when finite and between 16 and 64.

- [ ] **Step 4: Wire size state without writing fake Kepler visConfig**

Add `const [uavIconSize, setUavIconSize] = useState(32)`. In `dispatchAppearance`, handle `changes.iconSize` separately and do not send it to `createLayerAdvancedAction`. Change `preferencesFromState(state, iconSize)` to include `layers["wrj-trip-layer"].iconSize = iconSize`; restore it only after all six layers are ready. Reset sets 32 without reinjecting data or changing `animationConfig.currentTime`. Pass `{flightPaths, uavIconSize}` to `MapView`.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:run -- tests/workspace-panels.test.tsx tests/layer-preferences.test.ts tests/workspace.test.tsx`

Expected: PASS, including refresh restore and restore-default assertions.

```powershell
git add src/components/Workspace.tsx src/components/workspace/LayerSidebar.tsx src/features/layers/layerPreferences.ts tests/workspace-panels.test.tsx tests/layer-preferences.test.ts tests/workspace.test.tsx
git commit -m "feat: persist UAV marker size control"
```

### Task 5: Complete integration and acceptance

**Files:**
- Modify: `tests/kepler-integration.test.ts`
- Modify: `docs/P0_VALIDATION.md`

- [ ] **Step 1: Add the real reducer integration assertions**

Load the actual case, extract three paths, build marker layers from the real Trip layer state, and assert three marker records. Change the Trip palette through `createUavPaletteAction`, rebuild, and assert marker colors match the new palette. Toggle Trip visibility and assert no marker layer. Record `animationConfig.currentTime` before these changes and assert it is unchanged afterward.

- [ ] **Step 2: Run the focused integration test**

Run: `npm run test:run -- tests/kepler-integration.test.ts`

Expected: PASS.

- [ ] **Step 3: Run all quality gates**

Run each with a 60-second upper bound:

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: zero errors, all tests pass, production bundle builds. Existing Kepler/transitive externalization and chunk-size warnings may remain documented.

- [ ] **Step 4: Browser acceptance**

At 1920×1080 and 1366×768 verify three same-colored marker/path pairs, Trip play/pause/seek synchronization, heading through turns, zoom/rotate/pitch alignment, Trip visibility, live palette changes, 16/32/64 px size changes, refresh persistence, reset default, Tooltip interaction, and no extra Dataset or Trip reset.

- [ ] **Step 5: Update validation notes and commit**

Document the tested browser, resolutions, commands, results, and any non-blocking build warnings in `docs/P0_VALIDATION.md`.

```powershell
git add tests/kepler-integration.test.ts docs/P0_VALIDATION.md
git commit -m "test: validate synchronized UAV flight markers"
```

