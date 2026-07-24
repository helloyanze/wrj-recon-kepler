# WRJ Keyless Dark/Light Basemap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the keyless public Voyager/OSM pair with CARTO Dark Matter/Positron and expose them as “深色地图 / 亮色地图” without disturbing mission layers or animation.

**Architecture:** Keep the existing `satellite` and `light` Kepler style IDs so all map actions and persisted configuration remain compatible. Change only the public provider’s two inline raster styles and labels; Mapbox and local providers keep their current behavior.

**Tech Stack:** React 18, TypeScript, Kepler.gl 3.2.6, MapLibre Style v8 raster sources, Vitest, Testing Library.

---

### Task 1: Public dark/light raster styles

**Files:**
- Modify: `tests/basemap-config.test.ts`
- Modify: `src/basemap/basemapConfig.ts`

- [ ] **Step 1: Write the failing public-basemap assertions**

Update the public-mode expectations to require the new labels, four CARTO Dark Matter URLs, four CARTO Positron URLs and CARTO attribution on both stable style IDs:

```ts
expect(result).toMatchObject({
  provider: "public",
  primaryLabel: "深色地图",
  secondaryLabel: "亮色地图",
  attributionByStyle: {
    satellite: "© OpenStreetMap contributors · © CARTO",
    light: "© OpenStreetMap contributors · © CARTO"
  }
});
expect(result.mapStyles?.[0].style.sources.raster.tiles).toEqual([
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
]);
expect(result.mapStyles?.[1].style.sources.raster.tiles).toEqual([
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx --no-install vitest run tests/basemap-config.test.ts
```

Expected: FAIL because the current implementation still returns “公共地图 / OSM 简洁图”, Voyager and `tile.openstreetmap.org`.

- [ ] **Step 3: Implement the minimal public-style change**

In `src/basemap/basemapConfig.ts`, replace the single Voyager constant with a small CARTO URL factory and construct both styles:

```ts
function cartoTiles(style: "dark_all" | "light_all"): string[] {
  return ["a", "b", "c", "d"].map(
    subdomain =>
      `https://${subdomain}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`
  );
}
```

Return:

```ts
mapStyles: [
  {
    id: "satellite",
    style: createRasterStyle(cartoTiles("dark_all"), CARTO_ATTRIBUTION)
  },
  {
    id: "light",
    style: createRasterStyle(cartoTiles("light_all"), CARTO_ATTRIBUTION)
  }
],
primaryLabel: "深色地图",
secondaryLabel: "亮色地图",
attributionByStyle: {
  satellite: CARTO_ATTRIBUTION,
  light: CARTO_ATTRIBUTION
}
```

Do not change `mapboxBasemap()` or `localBasemap()`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx --no-install vitest run tests/basemap-config.test.ts
```

Expected: all `basemap-config` tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/basemap/basemapConfig.ts tests/basemap-config.test.ts
git commit -m "feat: add keyless dark light basemaps"
```

### Task 2: Workspace integration regression

**Files:**
- Modify: `tests/workspace.test.tsx`
- Test: `tests/wrj-kepler-map.test.tsx`

- [ ] **Step 1: Write the failing workspace label regression**

Change the public-mode shell assertions to:

```ts
expect(screen.getByRole("button", {name: "深色地图"})).toBeEnabled();
expect(screen.getByRole("button", {name: "亮色地图"})).toBeEnabled();
```

Retain the existing dispatch check:

```ts
expect(dispatch).toHaveBeenCalledWith(
  wrapTo(WRJ_MAP_ID, mapStyleChange("light"))
);
```

This proves user-facing labels change while the stable Kepler style action remains unchanged.

- [ ] **Step 2: Run the focused workspace tests and verify RED**

Run:

```powershell
npx --no-install vitest run tests/workspace.test.tsx tests/wrj-kepler-map.test.tsx
```

Expected before Task 1 implementation: FAIL because the old public labels are rendered. If Task 1 is already complete, temporarily verify the changed assertion would have failed against the preceding commit, then run the current code.

- [ ] **Step 3: Run focused integration tests and verify GREEN**

Run:

```powershell
npx --no-install vitest run tests/basemap-config.test.ts tests/workspace.test.tsx tests/wrj-kepler-map.test.tsx
```

Expected: all focused tests pass, and no mission overlay files require changes.

- [ ] **Step 4: Commit**

```powershell
git add -- tests/workspace.test.tsx
git commit -m "test: cover dark light basemap controls"
```

### Task 3: Browser and production verification

**Files:**
- Modify: `docs/P0_VALIDATION.md`

- [ ] **Step 1: Run the full automated matrix**

Run separately with bounded timeouts:

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: all commands exit 0. Existing Vite warnings about Kepler transitive Node modules and the large main chunk remain non-blocking.

- [ ] **Step 2: Verify both public styles in the browser**

Open the existing local preview and confirm:

1. Default button “深色地图” is active.
2. Network resources include `basemaps.cartocdn.com/dark_all/`.
3. The background is dark and blue/orange mission paths plus triangle markers remain distinguishable.
4. Clicking “亮色地图” keeps the same camera and mission time.
5. Network resources include `basemaps.cartocdn.com/light_all/`.
6. Clicking “深色地图” restores Dark Matter without reloading the case.

- [ ] **Step 3: Record the actual evidence**

Append a dated subsection to `docs/P0_VALIDATION.md` containing only checks actually observed. State that CARTO tiles are requested directly by the end-user browser and that no `VITE_MAPBOX_TOKEN` is required.

- [ ] **Step 4: Commit**

```powershell
git add -- docs/P0_VALIDATION.md
git commit -m "docs: validate dark light basemap switching"
```

- [ ] **Step 5: Confirm clean delivery state**

Run:

```powershell
git status --short
git log -3 --oneline
```

Expected: no status output and the three dark/light implementation commits at the branch tip.
