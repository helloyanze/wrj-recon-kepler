import {afterEach, describe, expect, it, vi} from "vitest";
import {loadCase} from "../src/data/loadCase";

const datasets = [
  ["wrj-real-pois", "/data/riyue-3d/real/real-pois.geojson", "REAL_PUBLIC_GEODATA"],
  ["wrj-real-context", "/data/riyue-3d/real/real-context.geojson", "REAL_PUBLIC_GEODATA"],
  ["wrj-simulated-region", "/data/riyue-3d/simulated/region.geojson", "SIMULATED_MISSION_DATA"],
  ["wrj-simulated-strips", "/data/riyue-3d/simulated/strips.geojson", "SIMULATED_MISSION_DATA"],
  [
    "wrj-simulated-planned-routes",
    "/data/riyue-3d/simulated/planned-routes.geojson",
    "SIMULATED_MISSION_DATA"
  ],
  ["wrj-simulated-trips", "/data/riyue-3d/simulated/trips.csv", "SIMULATED_MISSION_DATA"]
].map(([id, file, dataNature]) => ({id, file, dataNature}));

const manifest = {
  caseId: "riyue-3d",
  name: "日月湾真实环境三维侦察演示",
  coordinateReference: "EPSG:4326",
  basemap: {provider: "Mapbox", style: "satellite", dataNature: "REAL_BASEMAP"},
  summaryFile: "/data/riyue-3d/simulated/summary.json",
  keplerConfigFile: "/config/wrj-kepler-config.json",
  datasets
};

const summary = {
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
    totalDistanceKm: 63.23,
    totalFuelKg: null
  },
  uavs: [1, 2, 3].map((number) => ({
    uavId: `UAV-0${number}`,
    callsign: `WRJ0${number}`,
    stripRange: `${(number - 1) * 4 + 1}-${number * 4}`,
    distanceKm: 20,
    durationMin: 16,
    coverageAltitudeM: 90 + number * 8,
    transitAltitudeM: 120 + number * 8,
    maxAltitudeM: 130 + number * 8,
    status: "VALID"
  })),
  notice:
    "底图和公共地理对象来自真实地图数据；任务区域、条带和无人机航迹为模拟规划数据；本演示不构成真实飞行计划或空域信息。"
};

function response(value: unknown): Response {
  return new Response(typeof value === "string" ? value : JSON.stringify(value));
}

describe("loadCase", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and validates the manifest, summary, config and six datasets", async () => {
    const responseEntries: Array<readonly [string, unknown]> = [
      ["/data/riyue-3d/case-manifest.json", manifest],
      [manifest.summaryFile, summary],
      [manifest.keplerConfigFile, {mapState: {latitude: 18.625}}],
      ...datasets.map(
        ({file}) =>
          [
            file,
            file.endsWith(".csv")
              ? "_geojson\ntrip"
              : {type: "FeatureCollection", features: []}
          ] as const
      )
    ];
    const responses = new Map<string, unknown>(responseEntries);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return responses.has(url) ? response(responses.get(url)) : new Response("missing", {status: 404});
      })
    );

    const bundle = await loadCase("riyue-3d", "/data");

    expect(bundle.summary.metrics.uavCount).toBe(3);
    expect(bundle.datasets).toHaveLength(6);
    expect(bundle.datasets.find(({id}) => id === "wrj-simulated-trips")?.format).toBe("csv");
  });

  it("identifies the failing dataset URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/data/riyue-3d/case-manifest.json") return response(manifest);
        if (url === manifest.summaryFile) return response(summary);
        if (url === manifest.keplerConfigFile) return response({});
        return new Response("missing", {status: 404, statusText: "Not Found"});
      })
    );

    await expect(loadCase("riyue-3d", "/data")).rejects.toThrow(
      "/data/riyue-3d/real/real-pois.geojson"
    );
  });

  it("rebases every data resource when a temporary mirror base is configured", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url === "/mirror-data/riyue-3d/case-manifest.json") return response(manifest);
        if (url === "/mirror-data/riyue-3d/simulated/summary.json") return response(summary);
        if (url === manifest.keplerConfigFile) return response({});
        if (url.startsWith("/mirror-data/riyue-3d/")) {
          return response(url.endsWith(".csv") ? "_geojson\ntrip" : {type: "FeatureCollection", features: []});
        }
        return new Response("unexpected URL", {status: 404});
      })
    );

    await loadCase("riyue-3d", "/mirror-data");

    expect(requested).toContain("/mirror-data/riyue-3d/real/real-pois.geojson");
    expect(requested).toContain("/mirror-data/riyue-3d/simulated/trips.csv");
    expect(requested).not.toContain("/data/riyue-3d/real/real-pois.geojson");
  });
});
