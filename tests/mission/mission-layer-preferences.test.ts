import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
  clearMissionLayerPreferences,
  createDefaultMissionLayerPreferences,
  loadMissionLayerPreferences,
  saveMissionLayerPreferences,
  type MissionLayerPreferencesV3
} from "../../src/features/mission/missionLayerPreferences";

const V2_STORAGE_KEY = "wrj-mission-layer-preferences:v2:R10:PLAN-10";
const V3_STORAGE_KEY = "wrj-mission-layer-preferences:v3:R10:PLAN-10";
const UAV_IDS = ["UAV-05", "UAV-04", "UAV-05"];
const STRIPS = [
  {stripId: "ST-02", uavId: "UAV-05"},
  {stripId: "ST-01", uavId: "UAV-04"}
];

function defaults(
  caseId = "R10",
  planId = "PLAN-10",
  uavIds = UAV_IDS,
  strips = STRIPS
) {
  return createDefaultMissionLayerPreferences(caseId, planId, uavIds, strips);
}

function load(
  caseId = "R10",
  planId = "PLAN-10",
  uavIds = UAV_IDS,
  strips = STRIPS
) {
  return loadMissionLayerPreferences(caseId, planId, uavIds, strips);
}

describe("mission layer preferences v3", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates deterministic independent strip and per-layer UAV colors", () => {
    const preferences = defaults();

    expect(preferences).toMatchObject({
      version: 3,
      caseId: "R10",
      planId: "PLAN-10",
      stripColors: {
        "ST-01": "#35C5FF",
        "ST-02": "#FFB44D"
      },
      layerUavColors: {
        routes: {"UAV-04": "#35C5FF", "UAV-05": "#FFB44D"},
        trips: {"UAV-04": "#35C5FF", "UAV-05": "#FFB44D"},
        markers: {"UAV-04": "#35C5FF", "UAV-05": "#FFB44D"},
        scanned: {"UAV-04": "#35C5FF", "UAV-05": "#FFB44D"}
      },
      markerSize: 30,
      layers: {
        region: {visible: true, opacity: 0.18, filled: true, stroked: true},
        strips: {visible: true, opacity: 0.75, width: 2},
        scanned: {visible: true, opacity: 0.35},
        routes: {visible: true, opacity: 0.55, width: 2},
        trips: {visible: true, opacity: 0.95, width: 4, trailLengthSec: 240}
      }
    });
    expect(Object.keys(preferences.layerUavColors.routes)).toEqual(["UAV-04", "UAV-05"]);
    expect(Object.keys(preferences.stripColors)).toEqual(["ST-01", "ST-02"]);
  });

  it("round-trips v3 preferences and normalizes every color map", () => {
    const preferences: MissionLayerPreferencesV3 = {
      ...defaults(),
      markerSize: 42,
      stripColors: {"ST-01": "#112233", "ST-02": "#abcdef"},
      layerUavColors: {
        routes: {"UAV-04": "#123456", "UAV-05": "#abcdef"},
        trips: {"UAV-04": "#234567", "UAV-05": "#bcdef0"},
        markers: {"UAV-04": "#345678", "UAV-05": "#cdef01"},
        scanned: {"UAV-04": "#456789", "UAV-05": "#def012"}
      }
    };

    saveMissionLayerPreferences(preferences);

    expect(load()).toMatchObject({
      markerSize: 42,
      stripColors: {"ST-01": "#112233", "ST-02": "#ABCDEF"},
      layerUavColors: {
        routes: {"UAV-04": "#123456", "UAV-05": "#ABCDEF"},
        trips: {"UAV-04": "#234567", "UAV-05": "#BCDEF0"},
        markers: {"UAV-04": "#345678", "UAV-05": "#CDEF01"},
        scanned: {"UAV-04": "#456789", "UAV-05": "#DEF012"}
      }
    });
    expect(window.localStorage.getItem(V3_STORAGE_KEY)).not.toBeNull();
  });

  it("migrates a valid v2 shared UAV color into all v3 color scopes", () => {
    window.localStorage.setItem(V2_STORAGE_KEY, JSON.stringify({
      version: 2,
      caseId: "R10",
      planId: "PLAN-10",
      uavColors: {"UAV-04": "#aa0000", "UAV-05": "#00bb00"},
      markerSize: 40,
      layers: {
        region: {visible: true, opacity: 0.2, filled: true, stroked: true},
        strips: {visible: true, opacity: 0.6, width: 3},
        routes: {visible: false, opacity: 0.5, width: 4},
        trips: {visible: true, opacity: 0.9, width: 5, trailLengthSec: 90}
      }
    }));

    const migrated = load();

    expect(migrated.version).toBe(3);
    expect(migrated.stripColors).toEqual({
      "ST-01": "#AA0000",
      "ST-02": "#00BB00"
    });
    for (const colors of Object.values(migrated.layerUavColors)) {
      expect(colors).toEqual({"UAV-04": "#AA0000", "UAV-05": "#00BB00"});
    }
    expect(migrated.markerSize).toBe(40);
    expect(migrated.layers.routes.visible).toBe(false);
    expect(migrated.layers.scanned).toEqual({visible: true, opacity: 0.35});
  });

  it("drops unknown identities, restores invalid values and inserts new identities", () => {
    window.localStorage.setItem(V3_STORAGE_KEY, JSON.stringify({
      ...defaults(),
      stripColors: {
        "ST-01": "#abcdef",
        "ST-02": "orange",
        "ST-99": "#FFFFFF"
      },
      layerUavColors: {
        routes: {"UAV-04": "#123456", "UAV-05": "bad", "UAV-99": "#FFFFFF"},
        trips: {},
        markers: {},
        scanned: {}
      }
    }));

    const result = load(
      "R10",
      "PLAN-10",
      ["UAV-04", "UAV-05", "UAV-06"],
      [...STRIPS, {stripId: "ST-03", uavId: "UAV-06"}]
    );

    expect(result.stripColors).toEqual({
      "ST-01": "#ABCDEF",
      "ST-02": "#FFB44D",
      "ST-03": "#4ED6A0"
    });
    expect(result.layerUavColors.routes).toEqual({
      "UAV-04": "#123456",
      "UAV-05": "#FFB44D",
      "UAV-06": "#4ED6A0"
    });
    expect(result.layerUavColors.trips).toEqual({
      "UAV-04": "#35C5FF",
      "UAV-05": "#FFB44D",
      "UAV-06": "#4ED6A0"
    });
  });

  it("clamps all layer controls including the scanned layer", () => {
    const preferences = defaults();
    saveMissionLayerPreferences({
      ...preferences,
      markerSize: 100,
      layers: {
        region: {...preferences.layers.region, opacity: -1},
        strips: {...preferences.layers.strips, opacity: 2, width: 0},
        scanned: {...preferences.layers.scanned, opacity: 3},
        routes: {...preferences.layers.routes, width: 99},
        trips: {...preferences.layers.trips, trailLengthSec: 9_000}
      }
    });

    expect(load()).toMatchObject({
      markerSize: 64,
      layers: {
        region: {opacity: 0},
        strips: {opacity: 1, width: 0.5},
        scanned: {opacity: 1},
        routes: {width: 20},
        trips: {trailLengthSec: 3600}
      }
    });
  });

  it("uses independent v3 keys and clears both v2 and v3 for one case", () => {
    const first = defaults();
    const second = defaults("R11", "PLAN-11");
    first.markerSize = 22;
    second.markerSize = 55;
    saveMissionLayerPreferences(first);
    saveMissionLayerPreferences(second);
    window.localStorage.setItem(V2_STORAGE_KEY, "{}");

    clearMissionLayerPreferences("R10", "PLAN-10");

    expect(window.localStorage.getItem(V2_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(V3_STORAGE_KEY)).toBeNull();
    expect(load("R11", "PLAN-11").markerSize).toBe(55);
  });

  it("fails softly when browser storage is unavailable", () => {
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

    expect(load()).toEqual(defaults());
    expect(() => saveMissionLayerPreferences(defaults())).not.toThrow();
    expect(() => clearMissionLayerPreferences("R10", "PLAN-10")).not.toThrow();
  });
});
