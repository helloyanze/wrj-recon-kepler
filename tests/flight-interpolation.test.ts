// @vitest-environment node
import {describe, expect, it} from "vitest";
import {interpolateFlight} from "../src/features/flight/flightInterpolation";
import type {FlightCoordinate, UavFlightPath} from "../src/features/flight/flightPaths";

function path(coordinates: readonly FlightCoordinate[]): UavFlightPath {
  return {uavId: "UAV-01", coordinates};
}

describe("interpolateFlight", () => {
  it("linearly interpolates longitude, latitude, and altitude at the midpoint", () => {
    const result = interpolateFlight(path([
      [10, 20, 100, 1_000],
      [12, 24, 200, 1_100]
    ]), 1_050);

    expect(result?.uavId).toBe("UAV-01");
    expect(result?.position).toEqual([11, 22, 150]);
    expect(result?.heading).toBeGreaterThanOrEqual(0);
    expect(result?.heading).toBeLessThan(360);
  });

  it("clamps before the first sample and after the last sample", () => {
    const flight = path([
      [10, 0, 100, 1_000],
      [12, 0, 200, 1_100],
      [12, -2, 300, 1_200]
    ]);

    expect(interpolateFlight(flight, 0)).toMatchObject({
      position: [10, 0, 100],
      heading: 90
    });
    expect(interpolateFlight(flight, 9_999)).toMatchObject({
      position: [12, -2, 300],
      heading: 180
    });
  });

  it.each([
    ["north", [0, 0, 0, 0] as const, [0, 1, 0, 10] as const, 0],
    ["east", [0, 0, 0, 0] as const, [1, 0, 0, 10] as const, 90],
    ["south", [0, 1, 0, 0] as const, [0, 0, 0, 10] as const, 180],
    ["west", [1, 0, 0, 0] as const, [0, 0, 0, 10] as const, 270]
  ])("computes a normalized %s initial bearing", (_direction, start, end, heading) => {
    expect(interpolateFlight(path([start, end]), 5)?.heading).toBeCloseTo(heading, 8);
  });

  it("takes the short route east across the international date line", () => {
    const result = interpolateFlight(path([
      [179, 0, 10, 0],
      [-179, 0, 30, 10]
    ]), 5);

    expect(Math.abs(result?.position[0] ?? 0)).toBeCloseTo(180, 8);
    expect(result?.position[2]).toBe(20);
    expect(result?.heading).toBeCloseTo(90, 8);
  });

  it("returns null for an empty path or a non-finite requested time", () => {
    expect(interpolateFlight(path([]), 100)).toBeNull();
    expect(interpolateFlight(path([[0, 0, 0, 0], [1, 1, 1, 1]]), Number.NaN)).toBeNull();
  });
});
