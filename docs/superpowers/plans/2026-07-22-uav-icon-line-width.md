# UAV Animation Icon and Line Width Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three animated UAV markers visible and make supported line widths directly adjustable without interrupting Trip playback.

**Architecture:** Keep the existing Kepler Trip layer as the animation source and the existing Deck.gl `IconLayer` as the independently tinted UAV marker overlay. Fix the SVG's intrinsic dimensions so Deck.gl can create a non-empty texture atlas, then expose the existing `thickness` action path through a base-editor range control while retaining advanced-only controls for trail length, radius, fill, stroke, and marker size.

**Tech Stack:** React 18, TypeScript 5.6, Kepler.gl 3.2.6, Deck.gl 8.9.36, Vitest, Testing Library, CSS.

---

## File Structure

- Modify `public/assets/uav-fixed-wing-mask.svg`: add the SVG intrinsic pixel dimensions required by Deck.gl image loading.
- Modify `tests/uav-deck-layers.test.ts`: regress the blank-texture bug by asserting intrinsic SVG dimensions.
- Modify `src/components/workspace/LayerSidebar.tsx`: render thickness as a clamped base-editor range control and remove it from the advanced fieldset.
- Modify `src/index.css`: lay out the range slider and compact pixel-value output inside the existing 300 px sidebar.
- Modify `tests/workspace-panels.test.tsx`: model the three actual line layers and verify their line-width controls, ranges, callbacks, and advanced-control separation.

### Task 1: Make the UAV SVG safe for Deck.gl texture packing

**Files:**
- Modify: `tests/uav-deck-layers.test.ts`
- Modify: `public/assets/uav-fixed-wing-mask.svg`

- [ ] **Step 1: Write the failing intrinsic-dimension regression test**

Extend the existing `provides a safe white SVG mask that can be tinted at runtime` test with these assertions immediately after the `viewBox` assertion:

```ts
expect(document.documentElement.getAttribute("width")).toBe("64");
expect(document.documentElement.getAttribute("height")).toBe("64");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:run -- tests/uav-deck-layers.test.ts
```

Expected: FAIL because the received SVG `width` is `null` instead of `"64"`.

- [ ] **Step 3: Add the minimal SVG intrinsic dimensions**

Change only the root element in `public/assets/uav-fixed-wing-mask.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
```

Keep both existing white mask paths unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm run test:run -- tests/uav-deck-layers.test.ts
```

Expected: all tests in `tests/uav-deck-layers.test.ts` PASS with no warnings.

- [ ] **Step 5: Commit the isolated icon fix**

```powershell
git add -- tests/uav-deck-layers.test.ts public/assets/uav-fixed-wing-mask.svg
git commit -m "fix: load UAV SVG marker texture"
```

### Task 2: Put thickness controls in the base layer editor

**Files:**
- Modify: `tests/workspace-panels.test.tsx`
- Modify: `src/components/workspace/LayerSidebar.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Update the test fixture to model the real line layers**

In `makeLayers`, give indices 3, 4, and 5 their stable IDs, UAV color mode, and real capabilities:

```ts
const layerIds = [
  "layer-1",
  "layer-2",
  "layer-3",
  "wrj-strips-layer",
  "wrj-routes-layer",
  "wrj-trip-layer"
] as const;

function makeLayers(): LayerViewModel[] {
  return layerNames.map((label, index) => ({
    id: layerIds[index],
    label,
    visible: index !== 1,
    definition: {
      mode: index >= 3 ? "uav" : "single",
      capabilities: index === 0
        ? ["radius", "filled"]
        : index === 3 || index === 4
          ? ["thickness"]
          : index === 5
            ? ["thickness", "trailLength"]
            : []
    },
    appearance: {
      color: "#123456",
      opacity: 0.7,
      radius: 8,
      thickness: 3,
      trailLength: 120,
      filled: true,
      stroked: false,
      iconSize: index === 5 ? 32 : undefined,
      uavColors: {
        "UAV-01": "#ff0000",
        "UAV-02": "#00ff00",
        "UAV-03": "#0000ff"
      }
    }
  }));
}
```

- [ ] **Step 2: Write failing tests for the base line-width behavior**

Replace the route assertions that expect thickness only after opening advanced settings, and add this focused test:

```ts
it("shows a base line-width range for strips, routes, and Trip", () => {
  const props = makeSidebarProps();
  render(<LayerSidebar {...props} />);

  const routeWidth = screen.getByLabelText("模拟规划航迹 线宽");
  expect(routeWidth).toHaveAttribute("type", "range");
  expect(routeWidth).toHaveAttribute("min", "0.5");
  expect(routeWidth).toHaveAttribute("max", "20");
  expect(routeWidth).toHaveAttribute("step", "0.5");
  expect(screen.getByLabelText("模拟规划航迹 线宽值")).toHaveTextContent("3 px");

  fireEvent.change(routeWidth, {target: {value: "6.5"}});
  expect(props.onLayerChange).toHaveBeenCalledWith("wrj-routes-layer", {thickness: 6.5});

  fireEvent.click(screen.getByRole("button", {name: "编辑 模拟侦察条带"}));
  expect(screen.getByLabelText("模拟侦察条带 线宽")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", {name: "编辑 模拟 Trip"}));
  expect(screen.getByLabelText("模拟 Trip 线宽")).toBeInTheDocument();
  expect(screen.queryByLabelText("模拟 Trip 轨迹长度")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "展开 模拟 Trip 高级设置"}));
  expect(screen.getByLabelText("模拟 Trip 轨迹长度")).toBeInTheDocument();
});
```

Update the existing advanced-control test so it expects route thickness immediately and no route advanced-settings button:

```ts
expect(screen.getByLabelText("模拟规划航迹 线宽")).toBeInTheDocument();
expect(screen.queryByRole("button", {
  name: "展开 模拟规划航迹 高级设置"
})).not.toBeInTheDocument();
```

- [ ] **Step 3: Run the component test and verify RED**

Run:

```powershell
npm run test:run -- tests/workspace-panels.test.tsx
```

Expected: FAIL because route thickness is still absent until the advanced editor opens and is still a number input.

- [ ] **Step 4: Implement a clamped base thickness control**

Add these constants and helper near the existing value helpers in `LayerSidebar.tsx`:

```ts
const MIN_LINE_WIDTH = 0.5;
const MAX_LINE_WIDTH = 20;

function clampLineWidth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MIN_LINE_WIDTH;
  return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, value));
}
```

Remove the `thickness` number-input block from `AdvancedControls`. In `LayerEditor`, compute advanced availability without counting thickness:

```ts
const hasThickness = definition.capabilities.includes("thickness");
const hasAdvancedControls = definition.capabilities.some(
  (capability) => capability !== "thickness"
) || layer.id === "wrj-trip-layer";
const thickness = clampLineWidth(appearance.thickness);
```

Render this control in the base fieldset immediately after opacity:

```tsx
{hasThickness ? (
  <label>
    线宽
    <span className="layer-range-input">
      <input
        aria-label={`${label} 线宽`}
        type="range"
        min={MIN_LINE_WIDTH}
        max={MAX_LINE_WIDTH}
        step="0.5"
        value={thickness}
        onChange={(event) => onChange({
          thickness: numericValue(event.currentTarget.value)
        })}
      />
      <output aria-label={`${label} 线宽值`}>{`${thickness} px`}</output>
    </span>
  </label>
) : null}
```

- [ ] **Step 5: Add compact slider/output layout**

Add these rules after the existing sidebar range rule in `src/index.css`:

```css
.layer-range-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 5px;
  width: 112px;
}
.sidebar-shell .layer-range-input input[type="range"] { width: 100%; min-width: 0; }
.layer-range-input output {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm run test:run -- tests/workspace-panels.test.tsx tests/layer-controls.test.ts tests/layer-preferences.test.ts
```

Expected: all focused component, mapping, persistence, and Kepler action tests PASS.

- [ ] **Step 7: Commit the line-width interaction**

```powershell
git add -- tests/workspace-panels.test.tsx src/components/workspace/LayerSidebar.tsx src/index.css
git commit -m "feat: expose line width controls"
```

### Task 3: Full verification and browser acceptance

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run all automated quality gates**

Run each command independently:

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Expected: every command exits with code 0. Record the actual test-file and test-count totals from Vitest.

- [ ] **Step 2: Start a bounded preview server**

Run `npm run preview -- --host 127.0.0.1 --port 4173` in a background process, record its PID, and stop only that recorded process after verification.

- [ ] **Step 3: Verify the marker texture and animation in a browser**

Open the preview with a configured map source and confirm:

- the Deck.gl layer `wrj-uav-flight-markers` contains three markers;
- its generated icon atlas contains the white fixed-wing silhouette rather than a blank texture;
- UAV-01, UAV-02, and UAV-03 icons are simultaneously visible in their respective Trip colors;
- advancing the Trip time moves each marker along its own path;
- changing Trip color or marker size updates the icon without reinjecting datasets.

- [ ] **Step 4: Verify all three line-width controls**

For simulated strips, planned routes, and Trip:

- open the layer row and confirm line width is visible before opening advanced settings;
- change the slider and confirm the map updates immediately;
- confirm Trip playback continues at its current time;
- refresh once and confirm each saved thickness is restored;
- use restore defaults and confirm default widths return without data reload.

- [ ] **Step 5: Clean diagnostic processes and temporary artifacts**

Stop only the preview/browser PIDs started for this task. Remove only task-created files under `C:\tmp` after resolving and confirming their absolute paths. Do not alter user-owned `README.md`, `data/`, or `traccar-web/` changes.

- [ ] **Step 6: Confirm the final diff is scoped**

Run:

```powershell
git status --short
git log -5 --oneline
```

Expected: implementation files are committed; the pre-existing user-owned `README.md`, `data/`, and `traccar-web/` entries remain untouched.
