import {describe, expect, it} from "vitest";
import type {DisplayTransform, LocalPoint} from "../../src/features/cases/caseBundle";
import {
  createDisplayTransform,
  localToMapPoint
} from "../../src/features/cases/displayTransform";

const earthRadiusM = 6_378_137;
const radians = Math.PI / 180;

describe("algorithm display transform", () => {
  it("anchors the source bounding-box centre with east and north axes", () => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);

    expect(transform).toEqual({
      anchorLongitude: 110.235,
      anchorLatitude: 18.625,
      sourceCenterXM: 50_000,
      sourceCenterYM: 40_000,
      xAxis: "EAST",
      yAxis: "NORTH"
    });
  });

  it("calculates finite source centres for same-sign extreme coordinate bounds", () => {
    const transform = createDisplayTransform([
      [Number.MAX_VALUE, 0, 0],
      [Number.MAX_VALUE, 2, 0]
    ]);

    expect(transform.sourceCenterXM).toBe(Number.MAX_VALUE);
    expect(transform.sourceCenterYM).toBe(1);
    expect(Number.isFinite(transform.sourceCenterXM)).toBe(true);
  });

  it("maps the source centre exactly to the display anchor", () => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);

    expect(localToMapPoint([50_000, 40_000, 2_900], transform)).toEqual([
      110.235,
      18.625,
      2_900
    ]);
  });

  it("moves X east and Y north while preserving the other axes", () => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);
    const centre = localToMapPoint([50_000, 40_000, 0], transform);
    const east = localToMapPoint([51_000, 40_000, 0], transform);
    const north = localToMapPoint([50_000, 41_000, 0], transform);

    expect(east[0]).toBeGreaterThan(centre[0]);
    expect(east[1]).toBe(centre[1]);
    expect(east[2]).toBe(centre[2]);
    expect(north[0]).toBe(centre[0]);
    expect(north[1]).toBeGreaterThan(centre[1]);
    expect(north[2]).toBe(centre[2]);
  });

  it("preserves a 1000m local delta in the inverse local tangent distance", () => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);
    const centre = localToMapPoint([50_000, 40_000, 0], transform);
    const east = localToMapPoint([51_000, 40_000, 0], transform);
    const north = localToMapPoint([50_000, 41_000, 0], transform);
    const cosLatitude = Math.cos(transform.anchorLatitude * radians);
    const eastDistance =
      (east[0] - centre[0]) * radians * earthRadiusM * cosLatitude;
    const northDistance = (north[1] - centre[1]) * radians * earthRadiusM;

    expect(eastDistance).toBeCloseTo(1_000, 2);
    expect(northDistance).toBeCloseTo(1_000, 2);
  });

  it.each([0, 2_900])("preserves altitude %d without scaling or clamping", altitudeM => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);

    expect(localToMapPoint([50_000, 40_000, altitudeM], transform)[2]).toBe(altitudeM);
  });

  it("rejects an empty point set with a clear Chinese message", () => {
    expect(() => createDisplayTransform([])).toThrow(/点集不能为空/);
  });

  it.each<{coordinate: "X" | "Y" | "Z"; index: number; point: LocalPoint}>([
    {coordinate: "X", index: 0, point: [Number.NaN, 0, 0]},
    {coordinate: "Y", index: 1, point: [0, Number.POSITIVE_INFINITY, 0]},
    {coordinate: "Z", index: 2, point: [0, 0, Number.NEGATIVE_INFINITY]}
  ])("rejects non-finite $coordinate at point index $index", ({coordinate, index, point}) => {
    const points = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2]
    ] as LocalPoint[];
    points[index] = point;

    expect(() => createDisplayTransform(points)).toThrow(
      new RegExp(`点 ${index}.*${coordinate}`)
    );
  });

  it("rejects non-finite local input and transform values instead of returning NaN", () => {
    const validTransform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);
    const invalidTransform: DisplayTransform = {
      ...validTransform,
      sourceCenterXM: Number.NaN
    };

    expect(() => localToMapPoint([Number.NaN, 40_000, 0], validTransform)).toThrow(/X/);
    expect(() => localToMapPoint([50_000, 40_000, Number.POSITIVE_INFINITY], validTransform)).toThrow(
      /Z/
    );
    expect(() => localToMapPoint([50_000, 40_000, 0], invalidTransform)).toThrow(
      /sourceCenterXM/
    );
  });

  it.each([
    {label: "a latitude outside the geographic range", patch: {anchorLatitude: 90.001}},
    {label: "a polar anchor", patch: {anchorLatitude: 90}},
    {label: "a non-finite longitude", patch: {anchorLongitude: Number.NEGATIVE_INFINITY}}
  ])("rejects $label", ({patch}) => {
    const transform = createDisplayTransform([
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ]);

    expect(() => localToMapPoint([50_000, 40_000, 0], {...transform, ...patch})).toThrow();
  });

  it("rejects a finite local delta that overflows a derived display coordinate", () => {
    const nearPoleTransform: DisplayTransform = {
      anchorLongitude: 110.235,
      anchorLatitude: 89.999999999,
      sourceCenterXM: 0,
      sourceCenterYM: 0,
      xAxis: "EAST",
      yAxis: "NORTH"
    };

    expect(() => localToMapPoint([Number.MAX_VALUE, 0, 0], nearPoleTransform)).toThrow(
      /derived.*longitude|longitude.*finite/i
    );
  });

  it("does not mutate point inputs or the transform", () => {
    const points: LocalPoint[] = [
      [0, 0, 0],
      [100_000, 80_000, 2_900]
    ];
    const pointsBefore = structuredClone(points);
    const transform = createDisplayTransform(points);
    const transformBefore = structuredClone(transform);
    const point: LocalPoint = [50_000, 40_000, 2_900];
    const pointBefore = structuredClone(point);

    localToMapPoint(point, transform);

    expect(points).toEqual(pointsBefore);
    expect(point).toEqual(pointBefore);
    expect(transform).toEqual(transformBefore);
  });
});
