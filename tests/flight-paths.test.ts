// @vitest-environment node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {extractFlightPaths} from "../src/features/flight/flightPaths";

type TestFeature = {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
};

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tripsCsv(rows: Array<{uavId: string; geojson: string}>): string {
  return [
    "_geojson,uav_id",
    ...rows.map(({uavId, geojson}) => `${csvCell(geojson)},${csvCell(uavId)}`)
  ].join("\n");
}

function feature(coordinates: unknown, geometryType = "LineString"): string {
  const value: TestFeature = {
    type: "Feature",
    geometry: {type: geometryType, coordinates}
  };
  return JSON.stringify(value);
}

describe("extractFlightPaths", () => {
  it("extracts the three real Trip paths in fixed UAV order with increasing timestamps", () => {
    const raw = readFileSync(
      resolve("public/data/riyue-3d/simulated/trips.csv"),
      "utf8"
    );

    const paths = extractFlightPaths(raw);

    expect(paths.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.coordinates.length).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < path.coordinates.length; index += 1) {
        expect(path.coordinates[index][3]).toBeGreaterThan(path.coordinates[index - 1][3]);
      }
    }
  });

  it("orders valid rows by fixed UAV identity rather than CSV row order", () => {
    const coordinates = [[110, 18, 10, 100], [111, 19, 20, 200]];
    const raw = tripsCsv([
      {uavId: "UAV-03", geojson: feature(coordinates)},
      {uavId: "UAV-01", geojson: feature(coordinates)},
      {uavId: "UAV-02", geojson: feature(coordinates)}
    ]);

    expect(extractFlightPaths(raw).map(({uavId}) => uavId)).toEqual([
      "UAV-01",
      "UAV-02",
      "UAV-03"
    ]);
  });

  it.each([
    ["malformed JSON", "UAV-01", "{not-json"],
    ["unsupported UAV", "UAV-99", feature([[110, 18, 10, 100], [111, 19, 20, 200]])],
    ["non-LineString geometry", "UAV-01", feature([110, 18, 10, 100], "Point")],
    ["too-short coordinate", "UAV-01", feature([[110, 18, 10, 100], [111, 19, 20]])],
    ["out-of-range longitude", "UAV-01", feature([[110, 18, 10, 100], [181, 19, 20, 200]])],
    ["out-of-range latitude", "UAV-01", feature([[110, 18, 10, 100], [111, -91, 20, 200]])],
    ["non-numeric altitude", "UAV-01", feature([[110, 18, 10, 100], [111, 19, "high", 200]])],
    ["non-finite timestamp", "UAV-01", feature([[110, 18, 10, 100], [111, 19, 20, "soon"]])],
    ["non-increasing timestamps", "UAV-01", feature([[110, 18, 10, 100], [111, 19, 20, 100]])],
    ["fewer than two points", "UAV-01", feature([[110, 18, 10, 100]])]
  ])("skips one invalid row without throwing: %s", (_label, uavId, geojson) => {
    const raw = tripsCsv([
      {uavId, geojson},
      {
        uavId: "UAV-02",
        geojson: feature([[120, 20, 30, 300], [121, 21, 40, 400]])
      }
    ]);

    expect(() => extractFlightPaths(raw)).not.toThrow();
    expect(extractFlightPaths(raw)).toEqual([
      {
        uavId: "UAV-02",
        coordinates: [[120, 20, 30, 300], [121, 21, 40, 400]]
      }
    ]);
  });
});
