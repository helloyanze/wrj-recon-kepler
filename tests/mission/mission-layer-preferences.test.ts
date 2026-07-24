import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
  clearMissionLayerPreferences,
  createDefaultMissionLayerPreferences,
  loadMissionLayerPreferences,
  saveMissionLayerPreferences,
  type MissionLayerPreferencesV2
} from "../../src/features/mission/missionLayerPreferences";

const STORAGE_KEY = "wrj-mission-layer-preferences:v2:R10:PLAN-10";

describe("mission layer preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates deterministic sorted colors for every dynamic UAV", () => {
    const preferences = createDefaultMissionLayerPreferences(
      "R10",
      "PLAN-10",
      ["UAV-08", "UAV-03", "UAV-08", "UAV-01", "UAV-07", "UAV-06", "UAV-05", "UAV-04", "UAV-02"]
    );

    expect(Object.keys(preferences.uavColors)).toEqual([
      "UAV-01",
      "UAV-02",
      "UAV-03",
      "UAV-04",
      "UAV-05",
      "UAV-06",
      "UAV-07",
      "UAV-08"
    ]);
    expect(Object.values(preferences.uavColors).every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
    expect(preferences.uavColors).toMatchObject({
      "UAV-01": "#35C5FF",
      "UAV-02": "#FFB44D",
      "UAV-03": "#4ED6A0",
      "UAV-04": "#B985FF",
      "UAV-05": "#FF6B7A",
      "UAV-06": "#4DDBD1"
    });
    expect(
      createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-08", "UAV-07"]).uavColors
    ).toEqual(
      createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-07", "UAV-08"]).uavColors
    );
  });

  it("creates the four synchronized mission layer defaults", () => {
    expect(createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toEqual({
      version: 2,
      caseId: "R10",
      planId: "PLAN-10",
      uavColors: {"UAV-04": "#35C5FF"},
      markerSize: 30,
      layers: {
        region: {visible: true, opacity: 0.18, filled: true, stroked: true},
        strips: {visible: true, opacity: 0.75, width: 2},
        routes: {visible: true, opacity: 0.55, width: 2},
        trips: {visible: true, opacity: 0.95, width: 4, trailLengthSec: 240}
      }
    });
  });

  it("round-trips preferences and normalizes colors to uppercase", () => {
    const preferences: MissionLayerPreferencesV2 = {
      ...createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]),
      markerSize: 42,
      uavColors: {"UAV-04": "#ff6600"},
      layers: {
        region: {visible: false, opacity: 0.25, filled: false, stroked: true},
        strips: {visible: false, opacity: 0.4, width: 3.5},
        routes: {visible: true, opacity: 0.65, width: 5},
        trips: {visible: true, opacity: 0.8, width: 6, trailLengthSec: 180}
      }
    };

    saveMissionLayerPreferences(preferences);

    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toEqual({
      ...preferences,
      uavColors: {"UAV-04": "#FF6600"}
    });
  });

  it("clamps numeric values to their supported control ranges", () => {
    const preferences = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]);
    saveMissionLayerPreferences({
      ...preferences,
      markerSize: 100,
      layers: {
        region: {...preferences.layers.region, opacity: -1},
        strips: {...preferences.layers.strips, opacity: 2, width: 0},
        routes: {...preferences.layers.routes, width: 99},
        trips: {...preferences.layers.trips, trailLengthSec: 9_000}
      }
    });

    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toMatchObject({
      markerSize: 64,
      layers: {
        region: {opacity: 0},
        strips: {opacity: 1, width: 0.5},
        routes: {width: 20},
        trips: {trailLengthSec: 3600}
      }
    });
  });

  it("rejects wrong metadata and malformed core structures", () => {
    const defaults = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]);
    const malformedValues = [
      "{",
      JSON.stringify({version: 1, caseId: "R10", planId: "PLAN-10", uavColors: {}, layers: {}}),
      JSON.stringify({version: 2, caseId: "OTHER", planId: "PLAN-10", uavColors: {}, layers: {}}),
      JSON.stringify({version: 2, caseId: "R10", planId: "OTHER", uavColors: {}, layers: {}}),
      JSON.stringify({version: 2, caseId: "R10", planId: "PLAN-10", uavColors: [], layers: {}}),
      JSON.stringify({version: 2, caseId: "R10", planId: "PLAN-10", uavColors: {}, layers: []})
    ];

    for (const value of malformedValues) {
      window.localStorage.setItem(STORAGE_KEY, value);
      expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toEqual(defaults);
    }
  });

  it("drops unknown UAVs, restores invalid colors and inserts newly discovered UAVs", () => {
    const preferences = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04", "UAV-05"]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...preferences,
      uavColors: {
        "UAV-04": "#abcdef",
        "UAV-05": "orange",
        "UAV-99": "#FFFFFF"
      }
    }));

    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04", "UAV-05", "UAV-06"]).uavColors).toEqual({
      "UAV-04": "#ABCDEF",
      "UAV-05": "#FFB44D",
      "UAV-06": "#4ED6A0"
    });
  });

  it("uses independent per-case and per-plan storage keys", () => {
    const first = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]);
    const second = createDefaultMissionLayerPreferences("R11", "PLAN-11", ["UAV-04"]);
    first.markerSize = 22;
    second.markerSize = 55;

    saveMissionLayerPreferences(first);
    saveMissionLayerPreferences(second);

    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]).markerSize).toBe(22);
    expect(loadMissionLayerPreferences("R11", "PLAN-11", ["UAV-04"]).markerSize).toBe(55);
  });

  it("clears only the selected case and plan preferences", () => {
    saveMissionLayerPreferences(createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]));
    saveMissionLayerPreferences(createDefaultMissionLayerPreferences("R11", "PLAN-11", ["UAV-04"]));

    clearMissionLayerPreferences("R10", "PLAN-10");

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("wrj-mission-layer-preferences:v2:R11:PLAN-11")).not.toBeNull();
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

    const defaults = createDefaultMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"]);
    expect(loadMissionLayerPreferences("R10", "PLAN-10", ["UAV-04"])).toEqual(defaults);
    expect(() => saveMissionLayerPreferences(defaults)).not.toThrow();
    expect(() => clearMissionLayerPreferences("R10", "PLAN-10")).not.toThrow();
  });
});
