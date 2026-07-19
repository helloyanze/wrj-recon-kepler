import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const root = resolve("public/data/riyue-3d");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const [manifest, provenance, pois, context, region, strips, routes, summary, tripsCsv] =
  await Promise.all([
    readJson("case-manifest.json"),
    readJson("real/provenance.json"),
    readJson("real/real-pois.geojson"),
    readJson("real/real-context.geojson"),
    readJson("simulated/region.geojson"),
    readJson("simulated/strips.geojson"),
    readJson("simulated/planned-routes.geojson"),
    readJson("simulated/summary.json"),
    readFile(resolve(root, "simulated/trips.csv"), "utf8")
  ]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function coordinatesOf(geometry) {
  const values = [];
  const visit = (value) => {
    if (Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)) {
      values.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    }
  };
  visit(geometry.coordinates);
  return values;
}

function withinBbox([longitude, latitude]) {
  const {west, east, south, north} = provenance.bbox;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

const expectedIds = [
  "wrj-real-pois",
  "wrj-real-context",
  "wrj-simulated-region",
  "wrj-simulated-strips",
  "wrj-simulated-planned-routes",
  "wrj-simulated-trips"
];
assert(
  JSON.stringify(manifest.datasets.map(({id}) => id)) === JSON.stringify(expectedIds),
  "清单必须按约定包含 6 个固定 Dataset ID"
);
assert(pois.features.length >= 3, "真实 POI 必须至少 3 个");
assert(context.type === "FeatureCollection", "真实上下文必须为 FeatureCollection");

for (const feature of [...pois.features, ...context.features]) {
  const properties = feature.properties;
  assert(properties.dataNature === "REAL_PUBLIC_GEODATA", "真实对象数据性质错误");
  assert(["node", "way", "relation"].includes(properties.sourceType), "真实对象缺少 OSM 类型");
  assert(/^\d+$/.test(properties.sourceId), "真实对象缺少 OSM ID");
  assert(properties.sourceRef === `${properties.sourceType}/${properties.sourceId}`, "OSM 来源引用不一致");
  assert(!Number.isNaN(Date.parse(properties.retrievedAt)), "真实对象抓取时间无效");
  assert(typeof properties.verifiedForDemo === "boolean", "真实对象缺少复核状态");
  assert(coordinatesOf(feature.geometry).every(withinBbox), `真实对象 ${properties.sourceRef} 越出声明边界`);
}
assert(
  provenance.normalizationPolicy?.visualReviewStatus === "PENDING_VISUAL_REVIEW",
  "真实数据目视复核状态必须显式记录"
);

const simulatedCollections = [region, strips, routes];
for (const feature of simulatedCollections.flatMap(({features}) => features)) {
  const properties = feature.properties;
  assert(properties.dataNature === "SIMULATED_MISSION_DATA", "模拟对象数据性质错误");
  assert(properties.caseId === "riyue-3d", "模拟对象算例 ID 错误");
  assert(!Number.isNaN(Date.parse(properties.generatedAt)), "模拟对象生成时间无效");
  assert(properties.operationalUseAllowed === false, "模拟对象不得允许真实飞行使用");
  assert(properties.simulationNote.includes("不可用于真实飞行"), "模拟对象缺少安全说明");
}

assert(region.features.length === 1, "模拟任务区域必须为 1 个");
assert(strips.features.length === 12, "模拟条带必须为 12 条");
assert(routes.features.length === 3, "静态完整规划线必须为 3 条");
assert(summary.uavs.length === 3, "摘要必须包含 3 架 UAV");
assert(summary.demoMock === true, "摘要必须标记为演示模拟数据");
assert(
  JSON.stringify(summary.uavs.map(({uavId}) => uavId)) === JSON.stringify(["UAV-01", "UAV-02", "UAV-03"]),
  "摘要 UAV ID 不完整"
);

const csvLines = tripsCsv.trim().split(/\r?\n/);
const headers = csvLines[0].split(",");
const requiredTripFields = [
  "_geojson", "uav_id", "missionStage", "coverage_altitude_m", "speed_mps",
  "start_time", "dataNature", "operationalUseAllowed"
];
assert(requiredTripFields.every((field) => headers.includes(field)), "Trip CSV 缺少 Tooltip 所需字段");
assert(csvLines.length === 4, "Trip CSV 必须包含 3 架 UAV");

const tripFeatures = csvLines.slice(1).map((line) => {
  const cells = parseCsvLine(line);
  assert(cells.length === headers.length, "Trip CSV 行字段数量不一致");
  return JSON.parse(cells[headers.indexOf("_geojson")]);
});

for (const feature of tripFeatures) {
  const properties = feature.properties;
  assert(properties.dataNature === "SIMULATED_MISSION_DATA", "Trip 数据性质错误");
  assert(properties.operationalUseAllowed === false, "Trip 不得允许真实飞行使用");
  const coordinates = feature.geometry.coordinates;
  assert(coordinates.length > 100, "Trip 采样点过少");
  coordinates.forEach((coordinate, index) => {
    assert(coordinate.length === 4, "Trip 坐标必须为 [longitude, latitude, altitude, timestamp]");
    assert(Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]), "Trip 经纬度无效");
    assert(Number.isFinite(coordinate[2]) && Number.isFinite(coordinate[3]), "Trip 高度或时间无效");
    if (index > 0) assert(coordinate[3] - coordinates[index - 1][3] === 2, "Trip 时间必须每 2 秒单调递增");
  });
}

const totalDistanceKm = Number(
  routes.features.reduce((sum, feature) => sum + feature.properties.total_distance_km, 0).toFixed(2)
);
const makespanSec = Math.max(
  ...tripFeatures.map((feature) => feature.properties.end_time - tripFeatures[0].properties.start_time)
);
assert(summary.metrics.totalDistanceKm === totalDistanceKm, "摘要总航程与路线不一致");
assert(summary.metrics.missionMakespanSec === makespanSec, "摘要并行完成时间与 Trip 不一致");

console.log(
  `数据校验通过：${pois.features.length} 个真实 POI、${context.features.length} 个真实上下文对象、12 条模拟条带、3 架模拟 UAV；真实对象目视复核仍待完成`
);
