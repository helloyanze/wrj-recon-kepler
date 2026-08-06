import {beforeEach, describe, expect, it} from "vitest";

import {
  createDefaultDynamicLayerPreferences,
  loadDynamicLayerPreferences,
  saveDynamicLayerPreferences
} from "../../src/features/dynamic-replanning/dynamicLayerPreferences";

describe("Task 2 layer preferences", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to change colors and persists per scene", () => {
    const defaults = createDefaultDynamicLayerPreferences(
      "resource-lost",
      ["UAV-02", "UAV-01"],
      ["T-A", "T-B"]
    );
    expect(defaults.colorMode).toBe("change");
    expect(defaults.changeColors.baseline_flown).toBe("#B8C2CC");
    expect(defaults.baselineRouteColor).not.toBe(
      defaults.changeColors.baseline_flown
    );
    expect(Object.keys(defaults.taskColors)).toEqual(["T-A", "T-B"]);
    expect(Object.keys(defaults.resourceColors)).toEqual(["UAV-01", "UAV-02"]);

    saveDynamicLayerPreferences({
      ...defaults,
      colorMode: "resource",
      layers: {
        ...defaults.layers,
        activeRoutes: {
          ...defaults.layers.activeRoutes,
          opacity: 0.4
        }
      }
    });
    const loaded = loadDynamicLayerPreferences(
      "resource-lost",
      ["UAV-01", "UAV-02"],
      ["T-A", "T-B"]
    );
    expect(loaded.colorMode).toBe("resource");
    expect(loaded.layers.activeRoutes.opacity).toBe(0.4);
    expect(loadDynamicLayerPreferences(
      "other-scene",
      ["UAV-01"]
    ).colorMode).toBe("change");
  });

  it("migrates the legacy baseline color and validates new color families", () => {
    localStorage.setItem(
      "wrj-dynamic-layer-preferences:v1:scene-1",
      JSON.stringify({
        ...createDefaultDynamicLayerPreferences("scene-1", ["UAV-01"]),
        baselineRouteColor: undefined,
        changeColors: {
          ...createDefaultDynamicLayerPreferences("scene-1", ["UAV-01"])
            .changeColors,
          baseline: "#112233"
        }
      })
    );
    const loaded = loadDynamicLayerPreferences(
      "scene-1",
      ["UAV-01"],
      ["T-A"]
    );
    expect(loaded.baselineRouteColor).toBe("#112233");
    expect(loaded.taskColors["T-A"]).toMatch(/^#[0-9A-F]{6}$/u);
  });
});
