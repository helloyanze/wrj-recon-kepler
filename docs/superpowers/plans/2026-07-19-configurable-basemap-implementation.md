# Configurable Basemap Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WRJ workspace start without a Mapbox Token, automatically select local, Mapbox, or public basemaps, and support local Style v8 JSON and XYZ raster services.

**Architecture:** A focused `basemapConfig` module converts environment inputs into a validated `ResolvedBasemap`, including stable `satellite`/`light` Kepler style IDs and `attributionByStyle`. `App` owns asynchronous local Style loading, cancellation, retry, and setup errors; `Workspace` owns provider-aware labels and per-style attribution; `WrjKeplerMap` only adapts the resolved configuration to Kepler props.

**Tech Stack:** React 18, TypeScript 5.6, Kepler.gl 3.2.6, Redux 4.2, Vitest 2.1, Testing Library, Vite 5.4.

---

## File Structure

- Create `src/basemap/basemapConfig.ts`: types, raster Style v8 construction, mode selection, local Style fetch/validation.
- Create `src/components/BasemapSetupPage.tsx`: loading and actionable configuration-error states.
- Create `tests/basemap-config.test.ts`: pure configuration, network, cancellation, and style-contract tests.
- Create `tests/app.test.tsx`: no-Token public bootstrap, local loading/error/retry, and explicit Mapbox error tests.
- Modify `src/App.tsx`: resolve basemap instead of blocking on a missing Token.
- Modify `src/components/WrjKeplerMap.tsx`: pass custom styles and replacement flag to Kepler.
- Modify `src/components/Workspace.tsx`: accept `ResolvedBasemap`, render dynamic labels/status/attribution.
- Create `tests/wrj-kepler-map.test.tsx`: verify the Kepler prop adapter with measured dimensions.
- Modify `tests/workspace.test.tsx`: provider-aware UI and action assertions.
- Modify `tests/kepler-integration.test.ts`: preserve stable style IDs and six-layer injection contract.
- Modify `.env.example`, `README.md`, and `docs/P0_VALIDATION.md`: document modes, local service requirements, and revised acceptance status.
- Remove `src/components/TokenMissingPage.tsx` after its replacement tests pass.

### Task 1: Basemap Configuration Contract

**Files:**
- Create: `src/basemap/basemapConfig.ts`
- Create: `tests/basemap-config.test.ts`

- [ ] **Step 1: Write failing priority and public-style tests**

```ts
import {describe, expect, it} from "vitest";
import {resolveBasemap} from "../src/basemap/basemapConfig";

describe("resolveBasemap", () => {
  it("uses keyless public styles when auto has no local settings or Mapbox Token", async () => {
    const result = await resolveBasemap({mode: "auto"});
    expect(result.provider).toBe("public");
    expect(result.mapboxToken).toBe("");
    expect(result.mapStyles?.map(({id}) => id)).toEqual(["satellite", "light"]);
    expect(result.mapStylesReplaceDefault).toBe(true);
  });

  it("prioritizes local configuration over a Mapbox Token in auto mode", async () => {
    const result = await resolveBasemap({
      mode: "auto",
      mapboxToken: "pk.test",
      localTileUrl: "http://127.0.0.1:8080/{z}/{x}/{y}.png"
    });
    expect(result.provider).toBe("local");
  });

  it("uses Mapbox when auto has a Token and no local configuration", async () => {
    const result = await resolveBasemap({mode: "auto", mapboxToken: "pk.test"});
    expect(result).toMatchObject({
      provider: "mapbox",
      mapboxToken: "pk.test",
      mapStylesReplaceDefault: false
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm run test:run -- tests/basemap-config.test.ts`

Expected: FAIL because `src/basemap/basemapConfig.ts` does not exist.

- [ ] **Step 3: Implement the minimal public, local XYZ, and Mapbox resolver**

```ts
export type BasemapMode = "auto" | "public" | "local" | "mapbox";
export type BasemapProvider = Exclude<BasemapMode, "auto">;
export type MapStyleV8 = Record<string, unknown> & {
  version: 8;
  sources: Record<string, unknown>;
  layers: unknown[];
};

export interface BasemapEnvironment {
  mode?: string;
  mapboxToken?: string;
  localStyleUrl?: string;
  localTileUrl?: string;
  localAttribution?: string;
}

export interface ResolvedBasemap {
  provider: BasemapProvider;
  mapboxToken: string;
  mapStyles?: Array<{id: "satellite" | "light"; style: MapStyleV8}>;
  mapStylesReplaceDefault: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  statusLabel: string;
  attributionByStyle: Record<"satellite" | "light", string>;
}

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CARTO_TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";

export function createRasterStyle(
  tiles: string[],
  attribution: string,
  tileSize = 256
): MapStyleV8 {
  return {
    version: 8,
    sources: {basemap: {type: "raster", tiles, tileSize, attribution}},
    layers: [{id: "basemap", type: "raster", source: "basemap"}]
  };
}
```

Implement `resolveBasemap(environment, signal?, fetcher = fetch)` with explicit-mode validation and stable style IDs. Public `satellite` uses CARTO subdomains expanded to `a`–`d`; public/local `light` uses OSM.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- tests/basemap-config.test.ts`

Expected: all priority/public tests PASS.

- [ ] **Step 5: Write failing validation and local Style tests**

Add tests that assert:

```ts
await expect(resolveBasemap({mode: "mapbox"})).rejects.toThrow("Mapbox Token");
await expect(resolveBasemap({mode: "local"})).rejects.toThrow("本地地图");
await expect(
  resolveBasemap({mode: "local", localTileUrl: "http://tiles/{z}/{x}.png"})
).rejects.toThrow("{y}");

const fetcher = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({version: 8, sources: {}, layers: []}))
);
const local = await resolveBasemap(
  {mode: "local", localStyleUrl: "http://maps/style.json"},
  undefined,
  fetcher
);
expect(local.mapStyles?.[0].style.version).toBe(8);
expect(fetcher).toHaveBeenCalledWith("http://maps/style.json", {signal: undefined});
```

Also cover invalid mode, HTTP 503, invalid JSON, missing `sources`, missing `layers`, and an aborted request.

- [ ] **Step 6: Run the expanded test and verify RED**

Run: `npm run test:run -- tests/basemap-config.test.ts`

Expected: validation and Style URL tests FAIL because those branches are absent.

- [ ] **Step 7: Implement validation and local Style loading**

Use exact error prefixes such as `底图配置错误：` and `加载本地地图样式 <url> 失败：<status> <statusText>`. Validate `version === 8`, object `sources`, and array `layers` before returning the Style. Pass the supplied `AbortSignal` unchanged to `fetch`.

- [ ] **Step 8: Run all configuration tests and commit**

Run: `npm run test:run -- tests/basemap-config.test.ts`

Expected: PASS.

```powershell
git add src/basemap/basemapConfig.ts tests/basemap-config.test.ts
git commit -m "feat: resolve public mapbox and local basemaps"
```

### Task 2: Application Bootstrap and Error Recovery

**Files:**
- Create: `src/components/BasemapSetupPage.tsx`
- Create: `tests/app.test.tsx`
- Modify: `src/App.tsx`
- Remove: `src/components/TokenMissingPage.tsx`
- Modify: `tests/workspace.test.tsx`

- [ ] **Step 1: Write failing no-Token and retry component tests**

Mock `Workspace`, then render:

```tsx
render(<App basemapEnvironment={{mode: "public"}} />);
expect(await screen.findByTestId("workspace")).toHaveTextContent("public");
expect(screen.queryByText("缺少 Mapbox Token")).not.toBeInTheDocument();
```

For retry, inject a loader that rejects once with `new Error("style unavailable")` and resolves on the second call. Assert the error heading, exact reason, `重新加载底图` button, and successful Workspace render after clicking.

- [ ] **Step 2: Run App tests and verify RED**

Run: `npm run test:run -- tests/app.test.tsx`

Expected: FAIL because `App` still renders `TokenMissingPage` and has no basemap loader props.

- [ ] **Step 3: Implement cancellable App bootstrap**

Add these optional testable props while keeping production defaults:

```ts
export interface AppProps {
  debugMode?: boolean;
  dataBase?: string;
  basemapEnvironment?: BasemapEnvironment;
  basemapLoader?: typeof resolveBasemap;
}
```

Build the default environment from Vite variables. In an effect keyed by environment, loader, and retry attempt, create an `AbortController`, set loading, await `resolveBasemap`, ignore aborted completion, and expose loading/error/ready states. Cleanup aborts the request.

`BasemapSetupPage` renders either `正在准备地图底图…` or a `底图配置失败` heading with the exact error and retry button.

- [ ] **Step 4: Run App tests and verify GREEN**

Run: `npm run test:run -- tests/app.test.tsx tests/workspace.test.tsx`

Expected: App tests PASS; the old Token page test fails until removed.

- [ ] **Step 5: Remove the obsolete Token page and test**

Delete `TokenMissingPage.tsx`, remove its import and the `shows an explicit setup page when the Mapbox token is missing` test. Search for stale references:

Run: `rg -n "TokenMissingPage|缺少 Mapbox Token" src tests`

Expected: no matches.

- [ ] **Step 6: Run component tests and commit**

Run: `npm run test:run -- tests/app.test.tsx tests/workspace.test.tsx`

Expected: PASS.

```powershell
git add src/App.tsx src/components/BasemapSetupPage.tsx src/components/TokenMissingPage.tsx tests/app.test.tsx tests/workspace.test.tsx
git commit -m "feat: bootstrap keyless basemaps with retry"
```

### Task 3: Kepler and Workspace Integration

**Files:**
- Modify: `src/components/WrjKeplerMap.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/kepler/loadKeplerCase.ts`
- Modify: `tests/workspace.test.tsx`
- Modify: `tests/kepler-integration.test.ts`
- Create: `tests/wrj-kepler-map.test.tsx`

- [ ] **Step 1: Write failing provider-aware Workspace tests**

Create a `PUBLIC_BASEMAP` fixture with labels `公共地图` and `OSM 简洁图`, status `公共底图`, attribution `© OpenStreetMap contributors · © CARTO`. Render Workspace with it and assert the header buttons, status, and footer attribution. Click both buttons and assert the wrapped action payload style IDs remain `satellite` and `light`.

- [ ] **Step 2: Write a failing Kepler prop adapter test**

Mock `@kepler.gl/components`, provide a non-zero ResizeObserver size, render `WrjKeplerMap` with `PUBLIC_BASEMAP`, and assert the captured props contain:

```ts
expect(props).toMatchObject({
  id: "wrj-map",
  mapboxApiAccessToken: "",
  mapStylesReplaceDefault: true
});
expect(props.mapStyles.map(({id}) => id)).toEqual(["satellite", "light"]);
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm run test:run -- tests/workspace.test.tsx tests/wrj-kepler-map.test.tsx`

Expected: FAIL because Workspace and map props still accept a raw Token.

- [ ] **Step 4: Pass `ResolvedBasemap` through the component boundary**

Change `WorkspaceProps` to `basemap: ResolvedBasemap`, pass it to `MapView`, and change `WrjKeplerMapProps` likewise. Use:

```tsx
<KeplerGl
  id={WRJ_MAP_ID}
  mapboxApiAccessToken={basemap.mapboxToken}
  mapStyles={basemap.mapStyles}
  mapStylesReplaceDefault={basemap.mapStylesReplaceDefault}
  width={width}
  height={height}
/>
```

Render dynamic labels/status/attribution from `basemap`. Keep action IDs `satellite` and `light` and keep `styleType` initialized to `satellite`.

- [ ] **Step 5: Verify custom styles survive case injection**

First add an integration assertion that the parsed case config selects `satellite`. Then add a failing test with a saved config containing `mapStyle.mapStyles: {}` and assert the configuration passed to `addDataToMap` omits only that property.

Implement `preserveRuntimeMapStyles` in `loadKeplerCase.ts`: shallow-clone the parsed config and its `mapStyle`, delete `mapStyles`, and pass the result to `addDataToMap`. Do not change layers, view state, style type, or visible groups. This prevents the saved empty dictionary from replacing the runtime styles supplied by the Kepler component.

- [ ] **Step 6: Run integration tests and commit**

Run: `npm run test:run -- tests/workspace.test.tsx tests/wrj-kepler-map.test.tsx tests/kepler-integration.test.ts`

Expected: PASS.

```powershell
git add src/components/WrjKeplerMap.tsx src/components/Workspace.tsx src/kepler/loadKeplerCase.ts tests/workspace.test.tsx tests/wrj-kepler-map.test.tsx tests/kepler-integration.test.ts
git commit -m "feat: connect resolved basemaps to kepler workspace"
```

### Task 4: Environment and Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/P0_VALIDATION.md`

- [ ] **Step 1: Update the environment example**

Use exactly:

```env
VITE_WRJ_BASEMAP_MODE=auto
VITE_MAPBOX_TOKEN=
VITE_WRJ_LOCAL_STYLE_URL=
VITE_WRJ_LOCAL_TILE_URL=
VITE_WRJ_LOCAL_ATTRIBUTION=本地地图数据
VITE_WRJ_KEPLER_DEBUG=false
VITE_WRJ_DATA_BASE=/data
```

- [ ] **Step 2: Update README setup and examples**

Document automatic priority, explicit mode behavior, public service caveat, a local XYZ example, a local Style JSON example, CORS/glyphs/sprites requirements, and the fact that only explicit Mapbox mode requires a Token.

- [ ] **Step 3: Update P0 status without overstating Mapbox validation**

Record public no-Token mode as the new default fallback. Preserve the unchecked real Mapbox Token items. Add local service browser checks only after they are actually performed.

- [ ] **Step 4: Scan documentation consistency and commit**

Run:

```powershell
rg -n "缺少 Mapbox Token|只能完成|必须.*Token|VITE_WRJ_BASEMAP" README.md docs .env.example
```

Expected: no obsolete claim that every startup requires a Token; all new variable names match the implementation.

```powershell
git add .env.example README.md docs/P0_VALIDATION.md
git commit -m "docs: document public and local basemap modes"
```

### Task 5: Full Verification and Browser Acceptance

**Files:**
- Modify: `docs/P0_VALIDATION.md` only with observed results

- [ ] **Step 1: Run data and static verification**

Run:

```powershell
npm run data:validate
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: every command exits 0; record the actual test count and build output rather than copying prior counts.

- [ ] **Step 2: Verify public mode in a real browser**

Start Vite without `VITE_MAPBOX_TOKEN`, open the app, and verify CARTO tiles, OSM switch, six datasets, Trip time control, 3D rotation, dynamic attribution, and no Token setup page. Test 1920×1080 and 1366×768.

- [ ] **Step 3: Verify a local XYZ service**

Run a temporary workspace-scoped XYZ fixture/service, start Vite with `VITE_WRJ_BASEMAP_MODE=local` and `VITE_WRJ_LOCAL_TILE_URL`, then verify local tile requests, local attribution, public backup switching, and actionable failure/retry when the local service is stopped.

- [ ] **Step 4: Update validation evidence**

Add only observed results to `docs/P0_VALIDATION.md`. Keep real Mapbox satellite/Chrome/Edge validation unchecked until a valid Token is supplied.

- [ ] **Step 5: Inspect the final diff and commit**

Run:

```powershell
git status --short
git diff --check
git log --oneline -6
```

Expected: no whitespace errors; only intended files are modified or untracked.

```powershell
git add docs/P0_VALIDATION.md
git commit -m "test: record configurable basemap validation"
```
