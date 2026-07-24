// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {TripsLayer} from "@deck.gl/geo-layers";
import {IconLayer, PathLayer, PolygonLayer} from "@deck.gl/layers";
import {describe, expect, it, vi} from "vitest";
import type {CaseBundleV2} from "../../src/features/cases/caseBundle";
import {
  createDefaultMissionLayerPreferences
} from "../../src/features/mission/missionLayerPreferences";
import {
  createMissionDeckLayers
} from "../../src/features/mission/missionDeckLayers";

const TRIANGLE_MASK_PATH = resolve("public/assets/uav-triangle-mask.svg");

const bundle: CaseBundleV2 = {
  version: 2,
  case: {
    caseId: "R10",
    planId: "PLAN-10",
    displayName: "R10"
  },
  assignments: [{
    assignmentId: "ASG-01",
    uavId: "UAV-04",
    baseId: "BASE-01",
    flightCandidateId: "FPC-01",
    stripIds: ["ST-01"],
    stripStartIndex: 0,
    stripEndIndex: 0,
    batchIndex: 0,
    plannedLaunchTimeSec: 0
  }],
  sorties: [{
    trajectoryId: "TRJ-01",
    assignmentId: "ASG-01",
    uavId: "UAV-04",
    batchIndex: 0,
    plannedLaunchTimeSec: 0,
    stripIds: ["ST-01"],
    totalDistanceM: 100,
    totalDurationSec: 10,
    totalFuelKg: 1,
    segments: [{
      segmentId: "SEG-01",
      segmentType: "COVERAGE_LINE",
      stripId: "ST-01",
      startTimeSec: 0,
      endTimeSec: 10,
      heightM: 100,
      speedMps: 20,
      distanceM: 100,
      fuelConsumptionKg: 1,
      localPath: [
        [0, 0, 20],
        [100, 0, 100]
      ],
      mapPath: [
        [110, 18, 20],
        [111, 18, 100]
      ],
      timedPath: [
        [110, 18, 20, 0],
        [111, 18, 100, 10]
      ]
    }],
    trip: [
      [110, 18, 20, 0],
      [111, 18, 100, 10]
    ]
  }],
  strips: [{
    stripId: "ST-01",
    index: 0,
    uavId: "UAV-04",
    assignmentId: "ASG-01",
    line: [
      [110, 18, 0],
      [111, 18, 0]
    ],
    polygon: [
      [110, 17.9, 0],
      [111, 17.9, 0],
      [111, 18.1, 0],
      [110, 17.9, 0]
    ]
  }],
  region: {
    source: "DERIVED_FROM_STRIPS",
    polygon: [
      [109.9, 17.8, 0],
      [111.1, 17.8, 0],
      [111.1, 18.2, 0],
      [109.9, 17.8, 0]
    ]
  },
  metrics: {
    uavCount: 1,
    sortieCount: 1,
    batchCount: 1,
    stripCount: 1,
    coverageRatio: 1,
    missionMakespanSec: 10,
    totalDistanceM: 100,
    totalFuelKg: 1
  },
  validation: {valid: true, warnings: [], failureCodes: []},
  displayTransform: {
    anchorLongitude: 110.235,
    anchorLatitude: 18.625,
    sourceCenterXM: 0,
    sourceCenterYM: 0,
    xAxis: "EAST",
    yAxis: "NORTH"
  },
  provenance: {
    sourceName: "fixture.zip",
    sourceRun: "20260721T192032",
    importedAt: "2026-07-21T19:20:32.000Z",
    sha256: "a".repeat(64)
  }
};

function layerProps<T>(layer: {props: unknown}): T {
  return layer.props as T;
}

function makeLayers(
  missionTimeSec = 5,
  onSelectSortie?: (assignmentId: string) => void
) {
  const preferences = createDefaultMissionLayerPreferences(
    "R10",
    "PLAN-10",
    ["UAV-04"]
  );
  preferences.uavColors["UAV-04"] = "#123456";
  preferences.markerSize = 44;
  preferences.layers.region = {
    visible: false,
    opacity: 0.2,
    filled: false,
    stroked: true
  };
  preferences.layers.strips = {visible: true, opacity: 0.3, width: 3};
  preferences.layers.routes = {visible: false, opacity: 0.4, width: 5};
  preferences.layers.trips = {
    visible: true,
    opacity: 0.6,
    width: 7,
    trailLengthSec: 88
  };

  return createMissionDeckLayers({
    bundle,
    missionTimeSec,
    verticalScale: 4,
    preferences,
    onSelectSortie
  });
}

describe("mission triangle mask", () => {
  it("is a safe monochrome SVG whose nose points upward", () => {
    const svg = readFileSync(TRIANGLE_MASK_PATH, "utf8");
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(document.documentElement.getAttribute("width")).toBe("64");
    expect(document.documentElement.getAttribute("height")).toBe("64");
    expect(svg).toMatch(/fill=["']#fff(?:fff)?["']/i);
    expect(svg).toContain("M32 4");
    expect(document.querySelector("script, foreignObject")).toBeNull();
  });
});

describe("createMissionDeckLayers", () => {
  it("always returns the five synchronized layer types in stable order", () => {
    const layers = makeLayers();

    expect(layers.map(({id}) => id)).toEqual([
      "wrj-algorithm-region",
      "wrj-algorithm-strips",
      "wrj-algorithm-routes",
      "wrj-algorithm-trips",
      "wrj-algorithm-uav-triangles"
    ]);
    expect(layers[0]).toBeInstanceOf(PolygonLayer);
    expect(layers[1]).toBeInstanceOf(PathLayer);
    expect(layers[2]).toBeInstanceOf(PathLayer);
    expect(layers[3]).toBeInstanceOf(TripsLayer);
    expect(layers[4]).toBeInstanceOf(IconLayer);
  });

  it("keeps region and strips at sea level while scaling only route and trip altitude", () => {
    const [regionLayer, stripLayer, routeLayer, tripLayer] = makeLayers();
    const region = layerProps<{
      data: Array<{polygon: CaseBundleV2["region"]["polygon"]}>;
      getPolygon: (datum: {polygon: CaseBundleV2["region"]["polygon"]}) => number[][];
    }>(regionLayer);
    const strips = layerProps<{
      data: CaseBundleV2["strips"];
      getPath: (datum: CaseBundleV2["strips"][number]) => number[][];
    }>(stripLayer);
    const routes = layerProps<{
      data: CaseBundleV2["sorties"];
      getPath: (datum: CaseBundleV2["sorties"][number]) => number[][];
    }>(routeLayer);
    const trips = layerProps<{
      data: CaseBundleV2["sorties"];
      getPath: (datum: CaseBundleV2["sorties"][number]) => number[][];
      getTimestamps: (datum: CaseBundleV2["sorties"][number]) => number[];
    }>(tripLayer);

    expect(region.getPolygon(region.data[0]).every(point => point[2] === 0)).toBe(true);
    expect(strips.getPath(strips.data[0])).toEqual([
      [110, 18, 0],
      [111, 18, 0]
    ]);
    expect(routes.getPath(routes.data[0])).toEqual([
      [110, 18, 80],
      [111, 18, 400]
    ]);
    expect(trips.getPath(trips.data[0])).toEqual([
      [110, 18, 80],
      [111, 18, 400]
    ]);
    expect(trips.getTimestamps(trips.data[0])).toEqual([0, 10]);
    expect(bundle.sorties[0].trip[1]).toEqual([111, 18, 100, 10]);
  });

  it("reads visibility, opacity, widths, fill, stroke, clock and trail from preferences", () => {
    const [regionLayer, stripLayer, routeLayer, tripLayer] = makeLayers();

    expect(regionLayer.props).toMatchObject({
      visible: false,
      opacity: 0.2,
      filled: false,
      stroked: true
    });
    expect(stripLayer.props).toMatchObject({
      visible: true,
      opacity: 0.3,
      getWidth: 3
    });
    expect(routeLayer.props).toMatchObject({
      visible: false,
      opacity: 0.4,
      getWidth: 5
    });
    expect(tripLayer.props).toMatchObject({
      visible: true,
      opacity: 0.6,
      getWidth: 7,
      currentTime: 5,
      trailLength: 88
    });
  });

  it("uses one UAV color for strips, routes, trip tails and markers", () => {
    const [, stripLayer, routeLayer, tripLayer, markerLayer] = makeLayers();
    type UavDatum = {uavId: string};
    const expectedColor = [18, 52, 86, 255];

    for (const layer of [stripLayer, routeLayer, tripLayer]) {
      const props = layerProps<{
        data: UavDatum[];
        getColor: (datum: UavDatum) => number[];
      }>(layer);
      expect(props.getColor(props.data[0])).toEqual(expectedColor);
    }

    const marker = layerProps<{
      data: Array<{uavId: string}>;
      getColor: (datum: {uavId: string}) => number[];
    }>(markerLayer);
    expect(marker.getColor(marker.data[0])).toEqual(expectedColor);
  });

  it("shows flying and three-second landed markers with scaled altitude and clockwise heading", () => {
    const flyingLayer = makeLayers(5)[4];
    const flying = layerProps<{
      data: Array<{position: readonly [number, number, number]; headingDeg: number | null}>;
      billboard: boolean;
      getPosition: (datum: {position: readonly [number, number, number]}) => number[];
      getAngle: (datum: {headingDeg: number | null}) => number;
      getSize: () => number;
      getIcon: () => {url: string; width: number; height: number; anchorY: number; mask: boolean};
    }>(flyingLayer);

    expect(flying.data).toHaveLength(1);
    expect(flying.getPosition(flying.data[0])).toEqual([110.5, 18, 240]);
    // The SVG nose is at the top of the texture. IconLayer's map-plane
    // rotation is counter-clockwise after its texture Y flip, so an
    // eastbound clockwise-from-north heading must be supplied as -90°.
    expect(flying.getAngle(flying.data[0])).toBe(-90);
    expect(flying.getSize()).toBe(44);
    expect(flying.billboard).toBe(false);
    expect(flying.getIcon()).toEqual({
      url: "/assets/uav-triangle-mask.svg",
      width: 64,
      height: 64,
      anchorY: 32,
      mask: true
    });

    expect(layerProps<{data: unknown[]}>(makeLayers(-1)[4]).data).toHaveLength(0);
    expect(layerProps<{data: unknown[]}>(makeLayers(12.999)[4]).data).toHaveLength(1);
    expect(layerProps<{data: unknown[]}>(makeLayers(13)[4]).data).toHaveLength(0);
  });

  it("keeps pick data identifiable and wires selection only when requested", () => {
    const onSelectSortie = vi.fn();
    const layers = makeLayers(5, onSelectSortie);

    for (const layer of layers.slice(1)) {
      expect(layer.props.pickable).toBe(true);
      const props = layerProps<{
        data: Array<{assignmentId: string}>;
        onClick?: (info: {object: {assignmentId: string}}) => void;
      }>(layer);
      expect(props.data[0].assignmentId).toBe("ASG-01");
      props.onClick?.({object: props.data[0]});
    }
    expect(onSelectSortie).toHaveBeenCalledTimes(4);
    expect(onSelectSortie).toHaveBeenNthCalledWith(1, "ASG-01");

    for (const layer of makeLayers().slice(1)) {
      // Deck normalizes an omitted callback to its null default.
      expect(layer.props.onClick).toBeNull();
    }
  });
});
