// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {createUavDeckLayers} from "../src/features/flight/uavDeckLayers";
import type {UavFlightId, UavFlightPath} from "../src/features/flight/flightPaths";

const UAV_MASK_PATH = resolve("public/assets/uav-fixed-wing-mask.svg");

describe("UAV Deck.gl marker asset", () => {
  it("provides a safe white SVG mask that can be tinted at runtime", () => {
    const svg = readFileSync(UAV_MASK_PATH, "utf8");
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("svg");
    expect(document.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(svg).toMatch(/fill=["']#ffffff["']/i);
    expect(svg).not.toMatch(/#35c5ff|#ffb44d|#4ed6a0/i);
    expect(document.querySelector("script, foreignObject")).toBeNull();
  });
});

function path(
  uavId: UavFlightId,
  start: readonly [number, number, number, number],
  end: readonly [number, number, number, number]
): UavFlightPath {
  return {uavId, coordinates: [start, end]};
}

describe("createUavDeckLayers", () => {
  const paths: readonly UavFlightPath[] = [
    path("UAV-01", [110, 18, 100, 10], [112, 20, 300, 30]),
    path("UAV-02", [120, 28, 400, 20], [124, 32, 800, 40]),
    path("UAV-03", [100, 8, 50, 30], [106, 14, 350, 50])
  ];

  it("returns no layer when hidden or when interpolation yields no marker", () => {
    expect(createUavDeckLayers({paths, time: 20, visible: false})).toEqual([]);
    expect(
      createUavDeckLayers({
        paths: [{uavId: "UAV-01", coordinates: []}],
        time: 20,
        visible: true
      })
    ).toEqual([]);
  });

  it("builds one non-pickable billboard IconLayer with ordered interpolated markers", () => {
    const [layer] = createUavDeckLayers({
      paths,
      time: 30,
      visible: true,
      palette: ["#123456", "#ABCDEF", "#010203"],
      iconSize: 48
    });

    expect(layer.id).toBe("wrj-uav-flight-markers");
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.sizeUnits).toBe("pixels");

    const markers = layer.props.data as ReadonlyArray<{
      uavId: UavFlightId;
      position: readonly [number, number, number];
      heading: number;
      color: readonly [number, number, number, number];
    }>;
    expect(markers.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);
    expect(markers.map(({position}) => position)).toEqual([
      [112, 20, 300],
      [122, 30, 600],
      [100, 8, 50]
    ]);

    const getPosition = layer.props.getPosition as unknown as (marker: (typeof markers)[number]) =>
      readonly [number, number, number];
    const getAngle = layer.props.getAngle as (marker: (typeof markers)[number]) => number;
    const getColor = layer.props.getColor as unknown as (marker: (typeof markers)[number]) =>
      readonly [number, number, number, number];
    const getSize = layer.props.getSize as (marker: (typeof markers)[number]) => number;
    const getIcon = layer.props.getIcon as (marker: (typeof markers)[number]) => {
      url: string;
      width: number;
      height: number;
      anchorY: number;
      mask: boolean;
    };

    expect(getPosition(markers[1])).toEqual([122, 30, 600]);
    expect(getAngle(markers[1])).toBe(markers[1].heading);
    expect(getColor(markers[0])).toEqual([18, 52, 86, 255]);
    expect(getColor(markers[1])).toEqual([171, 205, 239, 255]);
    expect(getColor(markers[2])).toEqual([1, 2, 3, 255]);
    expect(getSize(markers[0])).toBe(48);
    expect(getIcon(markers[0])).toEqual({
      url: "/assets/uav-fixed-wing-mask.svg",
      width: 64,
      height: 64,
      anchorY: 32,
      mask: true
    });
  });

  it("uses each path's earliest time and the default size when time is null", () => {
    const [layer] = createUavDeckLayers({paths, time: null, visible: true});
    const markers = layer.props.data as ReadonlyArray<{position: readonly number[]}>;
    const getSize = layer.props.getSize as (marker: (typeof markers)[number]) => number;

    expect(markers.map(({position}) => position)).toEqual([
      [110, 18, 100],
      [120, 28, 400],
      [100, 8, 50]
    ]);
    expect(getSize(markers[0])).toBe(32);
  });
});
