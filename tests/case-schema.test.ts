import {describe, expect, it} from "vitest";
import {caseManifestSchema, caseSummarySchema} from "../src/data/caseSchema";

const notice =
  "底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。";

describe("case data contracts", () => {
  it("accepts the six fixed datasets", () => {
    const datasets = [
      ["wrj-real-pois", "REAL_PUBLIC_GEODATA"],
      ["wrj-real-context", "REAL_PUBLIC_GEODATA"],
      ["wrj-simulated-region", "SIMULATED_MISSION_DATA"],
      ["wrj-simulated-strips", "SIMULATED_MISSION_DATA"],
      ["wrj-simulated-planned-routes", "SIMULATED_MISSION_DATA"],
      ["wrj-simulated-trips", "SIMULATED_MISSION_DATA"]
    ].map(([id, dataNature]) => ({id, file: `/data/${id}.geojson`, dataNature}));

    expect(
      caseManifestSchema.parse({
        caseId: "riyue-3d",
        name: "日月湾真实环境三维侦察演示",
        coordinateReference: "EPSG:4326",
        basemap: {provider: "Mapbox", style: "satellite", dataNature: "REAL_BASEMAP"},
        summaryFile: "/data/riyue-3d/simulated/summary.json",
        keplerConfigFile: "/config/wrj-kepler-config.json",
        datasets
      }).datasets
    ).toHaveLength(6);
  });

  it("rejects a manifest with a missing fixed dataset", () => {
    expect(() =>
      caseManifestSchema.parse({
        caseId: "riyue-3d",
        name: "日月湾",
        coordinateReference: "EPSG:4326",
        basemap: {provider: "Mapbox", style: "satellite", dataNature: "REAL_BASEMAP"},
        summaryFile: "/data/riyue-3d/simulated/summary.json",
        keplerConfigFile: "/config/wrj-kepler-config.json",
        datasets: []
      })
    ).toThrow("算例必须包含 6 个固定 Dataset");
  });

  it("accepts a summary with three UAV records", () => {
    const uavs = [1, 2, 3].map((number) => ({
      uavId: `UAV-0${number}`,
      callsign: `WRJ0${number}`,
      stripRange: `${(number - 1) * 4 + 1}-${number * 4}`,
      distanceKm: 10,
      durationMin: 16,
      coverageAltitudeM: 90 + number * 8,
      transitAltitudeM: 120 + number * 8,
      maxAltitudeM: 130 + number * 8,
      status: "VALID"
    }));

    const result = caseSummarySchema.parse({
      schemaVersion: "1.0",
      caseId: "riyue-3d",
      name: "日月湾三维多无人机静态侦察",
      description: "三架轻型固定翼无人机协同完成近岸区域侦察。",
      status: "FEASIBLE",
      demoMock: true,
      location: "海南省万宁市日月湾附近海域",
      metrics: {
        uavCount: 3,
        stripCount: 12,
        coverageRatio: 0.98,
        missionMakespanSec: 1162,
        totalDistanceKm: 57.71,
        totalFuelKg: null
      },
      uavs,
      notice
    });

    expect(result.uavs.map(({uavId}) => uavId)).toEqual(["UAV-01", "UAV-02", "UAV-03"]);
  });

  it("rejects summaries that claim operational flight use", () => {
    expect(() =>
      caseSummarySchema.parse({
        schemaVersion: "1.0",
        caseId: "riyue-3d",
        name: "日月湾",
        description: "演示",
        status: "FEASIBLE",
        demoMock: false,
        location: "日月湾",
        metrics: {},
        uavs: [],
        notice
      })
    ).toThrow();
  });
});
