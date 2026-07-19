import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {buildMissionArtifacts, serializeTripsCsv} from "./lib/mission-data.mjs";

const generatedAt = new Date().toISOString();
const outputDirectory = resolve("public/data/riyue-3d/simulated");
const caseDirectory = resolve("public/data/riyue-3d");
const artifacts = buildMissionArtifacts({generatedAt});

const tripsCsv = serializeTripsCsv(artifacts.trips);

const manifest = {
  caseId: "riyue-3d",
  name: "日月湾真实环境三维侦察演示",
  coordinateReference: "EPSG:4326",
  basemap: {provider: "Mapbox", style: "satellite", dataNature: "REAL_BASEMAP"},
  summaryFile: "/data/riyue-3d/simulated/summary.json",
  keplerConfigFile: "/config/wrj-kepler-config.json",
  datasets: [
    {id: "wrj-real-pois", file: "/data/riyue-3d/real/real-pois.geojson", dataNature: "REAL_PUBLIC_GEODATA"},
    {id: "wrj-real-context", file: "/data/riyue-3d/real/real-context.geojson", dataNature: "REAL_PUBLIC_GEODATA"},
    {id: "wrj-simulated-region", file: "/data/riyue-3d/simulated/region.geojson", dataNature: "SIMULATED_MISSION_DATA"},
    {id: "wrj-simulated-strips", file: "/data/riyue-3d/simulated/strips.geojson", dataNature: "SIMULATED_MISSION_DATA"},
    {id: "wrj-simulated-planned-routes", file: "/data/riyue-3d/simulated/planned-routes.geojson", dataNature: "SIMULATED_MISSION_DATA"},
    {id: "wrj-simulated-trips", file: "/data/riyue-3d/simulated/trips.csv", dataNature: "SIMULATED_MISSION_DATA"}
  ]
};

await mkdir(outputDirectory, {recursive: true});
await Promise.all([
  writeFile(resolve(outputDirectory, "region.geojson"), `${JSON.stringify(artifacts.region, null, 2)}\n`),
  writeFile(resolve(outputDirectory, "strips.geojson"), `${JSON.stringify(artifacts.strips, null, 2)}\n`),
  writeFile(
    resolve(outputDirectory, "planned-routes.geojson"),
    `${JSON.stringify(artifacts.plannedRoutes, null, 2)}\n`
  ),
  writeFile(resolve(outputDirectory, "trips.csv"), tripsCsv),
  writeFile(resolve(outputDirectory, "summary.json"), `${JSON.stringify(artifacts.summary, null, 2)}\n`),
  writeFile(resolve(caseDirectory, "case-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
]);

console.log(
  `模拟任务数据已生成：${artifacts.strips.features.length} 条带、${artifacts.trips.features.length} 架 UAV、总航程 ${artifacts.summary.metrics.totalDistanceKm} km`
);
