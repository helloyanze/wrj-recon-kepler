import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {normalizeOverpassData} from "./lib/normalize-osm-features.mjs";
import {parseOsmXml} from "./lib/parse-osm-xml.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const queryFile = resolve(scriptDirectory, "overpass/riyue-real-features.overpass");
const outputDirectory = resolve(projectRoot, "public/data/riyue-3d/real");
const queryBbox = {south: 18.6, west: 110.18, north: 18.66, east: 110.27};
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

async function fetchOverpassEndpoint(endpoint, query) {
  const url = `${endpoint}?data=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {"User-Agent": "wrj-recon-kepler-demo/0.1"},
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return {endpoint, data: await response.json()};
}

async function fetchFromOverpass(query) {
  const settled = await Promise.allSettled(
    endpoints.map((endpoint) => fetchOverpassEndpoint(endpoint, query))
  );
  const success = settled.find((result) => result.status === "fulfilled");
  if (success) return {...success.value, failures: []};
  return {
    endpoint: null,
    data: null,
    failures: settled.map((result, index) => {
      const reason = result.status === "rejected" ? result.reason : "未知错误";
      return `${endpoints[index]}: ${reason instanceof Error ? reason.message : String(reason)}`;
    })
  };
}

function tileBboxes() {
  const longitudes = [110.18, 110.21, 110.24, 110.27];
  const latitudes = [18.6, 18.63, 18.66];
  const boxes = [];
  for (let row = 0; row < latitudes.length - 1; row += 1) {
    for (let column = 0; column < longitudes.length - 1; column += 1) {
      boxes.push([
        longitudes[column],
        latitudes[row],
        longitudes[column + 1],
        latitudes[row + 1]
      ]);
    }
  }
  return boxes;
}

async function fetchFromOsmApi() {
  const sources = [];
  const elements = new Map();
  for (const [index, bbox] of tileBboxes().entries()) {
    const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox.join(",")}`;
    const response = await fetch(url, {
      headers: {"User-Agent": "wrj-recon-kepler-demo/0.1"},
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(`OSM API 分块 ${index + 1} 失败：${response.status}`);
    const xml = await response.text();
    sources.push({file: `osm-api-source-${index + 1}.xml`, xml, bbox});
    for (const element of parseOsmXml(xml).elements) {
      elements.set(`${element.type}/${element.id}`, element);
    }
  }
  return {data: {elements: [...elements.values()]}, sources};
}

const query = await readFile(queryFile, "utf8");
const retrievedAt = new Date().toISOString();
const overpass = await fetchFromOverpass(query);
const fallback = overpass.data ? null : await fetchFromOsmApi();
const data = overpass.data ?? fallback.data;
const endpoint = overpass.endpoint ?? "https://api.openstreetmap.org/api/0.6/map";
const {pois, context} = normalizeOverpassData(data, retrievedAt, queryBbox);

if (pois.features.length < 3) {
  throw new Error(`真实地理对象仅 ${pois.features.length} 个，少于 P0 要求的 3 个；不得伪造补齐`);
}

const provenance = {
  source: "OpenStreetMap",
  endpoint,
  acquisitionMethod: overpass.data ? "OVERPASS_API" : "OSM_API_BBOX_FALLBACK",
  overpassFailures: overpass.failures,
  queryFile: "scripts/overpass/riyue-real-features.overpass",
  normalizedSourceFile: overpass.data ? "overpass-source.json" : "osm-api-normalized-source.json",
  rawSourceFiles: fallback?.sources.map(({file}) => file) ?? ["overpass-source.json"],
  retrievedAt,
  bbox: queryBbox,
  featureCount: pois.features.length + context.features.length,
  pointCount: pois.features.length,
  contextCount: context.features.length,
  normalizationPolicy: {
    requireTargetTag: true,
    requireAllGeometryCoordinatesInsideBbox: true,
    visualReviewStatus: "PENDING_VISUAL_REVIEW"
  },
  license: "ODbL",
  attribution: "© OpenStreetMap contributors"
};

await mkdir(outputDirectory, {recursive: true});
const sourceWrites = fallback
  ? fallback.sources.map(({file, xml}) => writeFile(resolve(outputDirectory, file), xml))
  : [];
await Promise.all([
  ...sourceWrites,
  writeFile(
    resolve(outputDirectory, provenance.normalizedSourceFile),
    `${JSON.stringify(data, null, 2)}\n`
  ),
  writeFile(resolve(outputDirectory, "real-pois.geojson"), `${JSON.stringify(pois, null, 2)}\n`),
  writeFile(resolve(outputDirectory, "real-context.geojson"), `${JSON.stringify(context, null, 2)}\n`),
  writeFile(resolve(outputDirectory, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)
]);

console.log(
  `真实地理数据已生成：${pois.features.length} 个 Point，${context.features.length} 个 Line/Polygon，方式 ${provenance.acquisitionMethod}`
);
