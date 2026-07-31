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
      ["UAV-02", "UAV-01"]
    );
    expect(defaults.colorMode).toBe("change");
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
      ["UAV-01", "UAV-02"]
    );
    expect(loaded.colorMode).toBe("resource");
    expect(loaded.layers.activeRoutes.opacity).toBe(0.4);
    expect(loadDynamicLayerPreferences(
      "other-scene",
      ["UAV-01"]
    ).colorMode).toBe("change");
  });
});
