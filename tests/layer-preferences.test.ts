import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
  clearLayerPreferences,
  loadLayerPreferences,
  saveLayerPreferences,
  type LayerPreferencesV1
} from "../src/features/layers/layerPreferences";

const STORAGE_KEY = "wrj-layer-preferences:v1:riyue-3d";

describe("layer preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips every supported preference field", () => {
    const preferences: LayerPreferencesV1 = {
      version: 1,
      caseId: "riyue-3d",
      layers: {
        "wrj-pois-layer": {
          visible: false,
          opacity: 0.45,
          color: "#12ABEF",
          radius: 8
        },
        "wrj-region-layer": {filled: true, stroked: false},
        "wrj-trip-layer": {
          thickness: 2.5,
          trailLength: 120,
          uavColors: {
            "UAV-01": "#FF0000",
            "UAV-02": "#00FF00",
            "UAV-03": "#0000FF"
          }
        }
      }
    };

    saveLayerPreferences(preferences);

    expect(loadLayerPreferences()).toEqual(preferences);
  });

  it("ignores unknown layer ids, unknown fields and invalid values while loading", () => {
    const serializedPreferences = JSON.stringify({
      version: 1,
      caseId: "riyue-3d",
      ignoredRootField: true,
      layers: {
        "wrj-pois-layer": {
          visible: true,
          opacity: 1.01,
          color: "red",
          radius: -1,
          thickness: "__RAW_INFINITY__",
          trailLength: 0,
          filled: "yes",
          stroked: false,
          ignoredField: "value",
          uavColors: {
            "UAV-01": "#A1B2C3",
            "UAV-02": "#abcd12",
            "UAV-03": "not-a-color",
            "UAV-99": "#FFFFFF"
          }
        },
        "wrj-routes-layer": {
          opacity: 0,
          color: "#123456",
          uavColors: {"UAV-01": "#123456"}
        },
        "unknown-layer": {visible: false}
      }
    }).replace('"__RAW_INFINITY__"', "1e400");

    window.localStorage.setItem(
      STORAGE_KEY,
      serializedPreferences
    );

    expect(loadLayerPreferences()).toEqual({
      version: 1,
      caseId: "riyue-3d",
      layers: {
        "wrj-pois-layer": {
          visible: true
        },
        "wrj-routes-layer": {
          opacity: 0,
          uavColors: {"UAV-01": "#123456"}
        }
      }
    });
  });

  it.each([
    ["missing data", null],
    ["damaged JSON", "{"],
    ["the wrong version", JSON.stringify({version: 2, caseId: "riyue-3d", layers: {}})],
    ["the wrong case", JSON.stringify({version: 1, caseId: "other", layers: {}})],
    ["an invalid root", JSON.stringify([])],
    ["an invalid layers collection", JSON.stringify({version: 1, layers: []})]
  ])("returns empty v1 preferences for %s", (_description, storedValue) => {
    if (storedValue !== null) window.localStorage.setItem(STORAGE_KEY, storedValue);

    expect(loadLayerPreferences()).toEqual({version: 1, caseId: "riyue-3d", layers: {}});
  });

  it("writes only sanitized v1 data", () => {
    saveLayerPreferences({
      version: 1,
      caseId: "riyue-3d",
      ignoredRootField: "value",
      layers: {
        "wrj-context-layer": {
          opacity: 0.8,
          color: "#ABCDEF",
          radius: Number.NaN,
          ignoredField: true
        },
        "wrj-region-layer": {filled: false},
        "wrj-strips-layer": {thickness: 3},
        "wrj-routes-layer": {visible: true},
        "wrj-trip-layer": {trailLength: 90},
        "unknown-layer": {visible: false}
      }
    } as unknown as LayerPreferencesV1);

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      version: 1,
      caseId: "riyue-3d",
      layers: {
        "wrj-context-layer": {opacity: 0.8, color: "#ABCDEF"},
        "wrj-region-layer": {filled: false},
        "wrj-strips-layer": {thickness: 3},
        "wrj-routes-layer": {visible: true},
        "wrj-trip-layer": {trailLength: 90}
      }
    });
  });

  it("filters fields by layer capability and rejects excessive advanced values", () => {
    saveLayerPreferences({
      version: 1,
      caseId: "riyue-3d",
      layers: {
        "wrj-pois-layer": {
          color: "#112233",
          uavColors: {"UAV-01": "#445566"},
          radius: 101,
          thickness: 3,
          filled: true
        },
        "wrj-region-layer": {
          color: "#778899",
          radius: 4,
          filled: false,
          stroked: true
        },
        "wrj-trip-layer": {
          color: "#AABBCC",
          uavColors: {"UAV-02": "#DDEEFF"},
          thickness: 51,
          trailLength: 3601
        }
      }
    });

    expect(loadLayerPreferences()).toEqual({
      version: 1,
      caseId: "riyue-3d",
      layers: {
        "wrj-pois-layer": {color: "#112233"},
        "wrj-region-layer": {color: "#778899", filled: false, stroked: true},
        "wrj-trip-layer": {uavColors: {"UAV-02": "#DDEEFF"}}
      }
    });
  });

  it("clears only the versioned preference key", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({version: 1, caseId: "riyue-3d", layers: {}}));
    window.localStorage.setItem("unrelated", "keep");

    clearLayerPreferences();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      }
    });

    expect(loadLayerPreferences()).toEqual({version: 1, caseId: "riyue-3d", layers: {}});
    expect(() => saveLayerPreferences({version: 1, caseId: "riyue-3d", layers: {}})).not.toThrow();
    expect(() => clearLayerPreferences()).not.toThrow();
  });

  it("does not throw when reading the localStorage property itself fails", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("property blocked");
      }
    });

    try {
      expectStorageApisToFailSoftly();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    }
  });

  it("does not throw when globalThis has no localStorage property", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "localStorage");

    try {
      expect("localStorage" in globalThis).toBe(false);
      expectStorageApisToFailSoftly();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    }
  });
});

function expectStorageApisToFailSoftly(): void {
  expect(loadLayerPreferences()).toEqual({version: 1, caseId: "riyue-3d", layers: {}});
  expect(() => saveLayerPreferences({version: 1, caseId: "riyue-3d", layers: {}})).not.toThrow();
  expect(() => clearLayerPreferences()).not.toThrow();
}
