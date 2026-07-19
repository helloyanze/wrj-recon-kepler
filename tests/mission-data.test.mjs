import {describe, expect, it} from "vitest";
import {
  buildMissionArtifacts,
  serializeTripsCsv
} from "../scripts/lib/mission-data.mjs";

const artifacts = buildMissionArtifacts({generatedAt: "2026-07-19T00:00:00.000Z"});

describe("deterministic simulated mission", () => {
  it("generates one region, twelve strips and three planned routes", () => {
    expect(artifacts.region.features).toHaveLength(1);
    expect(artifacts.strips.features).toHaveLength(12);
    expect(artifacts.plannedRoutes.features).toHaveLength(3);
    expect(artifacts.summary.metrics).toMatchObject({uavCount: 3, stripCount: 12});
  });

  it("marks every simulated feature as non-operational", () => {
    const features = [
      ...artifacts.region.features,
      ...artifacts.strips.features,
      ...artifacts.plannedRoutes.features,
      ...artifacts.trips.features
    ];
    for (const feature of features) {
      expect(feature.properties).toMatchObject({
        dataNature: "SIMULATED_MISSION_DATA",
        operationalUseAllowed: false,
        caseId: "riyue-3d"
      });
    }
  });

  it("uses four-dimensional trip coordinates with two-second monotonic timestamps", () => {
    expect(artifacts.trips.features).toHaveLength(3);
    for (const feature of artifacts.trips.features) {
      const coordinates = feature.geometry.coordinates;
      expect(coordinates.length).toBeGreaterThan(100);
      for (let index = 1; index < coordinates.length; index += 1) {
        expect(coordinates[index]).toHaveLength(4);
        expect(coordinates[index][3] - coordinates[index - 1][3]).toBe(2);
      }
    }
  });

  it("derives UAV and total distance metrics from generated routes", () => {
    const uavTotal = artifacts.summary.uavs.reduce((sum, uav) => sum + uav.distanceKm, 0);
    expect(artifacts.summary.metrics.totalDistanceKm).toBeCloseTo(uavTotal, 1);
    expect(artifacts.summary.uavs.map(({uavId}) => uavId)).toEqual([
      "UAV-01",
      "UAV-02",
      "UAV-03"
    ]);
  });

  it("serializes the Trip GeoJSON field without a BOM-prefixed column name", () => {
    const csv = serializeTripsCsv(artifacts.trips);
    expect(csv.startsWith("_geojson,")).toBe(true);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("serializes every field referenced by the Trip tooltip configuration", () => {
    const [header] = serializeTripsCsv(artifacts.trips).split("\r\n");
    expect(header.split(",")).toEqual(expect.arrayContaining([
      "missionStage",
      "coverage_altitude_m",
      "speed_mps",
      "start_time",
      "dataNature",
      "operationalUseAllowed"
    ]));
  });
});
