import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {normalizeOverpassData} from "./lib/normalize-osm-features.mjs";

const dataDirectory = resolve("public/data/riyue-3d/real");
const provenance = JSON.parse(await readFile(resolve(dataDirectory, "provenance.json"), "utf8"));
const raw = JSON.parse(
  await readFile(resolve(dataDirectory, provenance.normalizedSourceFile), "utf8")
);
const {pois, context} = normalizeOverpassData(raw, provenance.retrievedAt, provenance.bbox);

provenance.pointCount = pois.features.length;
provenance.contextCount = context.features.length;
provenance.featureCount = pois.features.length + context.features.length;
provenance.normalizationPolicy = {
  requireTargetTag: true,
  requireAllGeometryCoordinatesInsideBbox: true,
  visualReviewStatus: "PENDING_VISUAL_REVIEW"
};

await Promise.all([
  writeFile(resolve(dataDirectory, "real-pois.geojson"), `${JSON.stringify(pois, null, 2)}\n`),
  writeFile(resolve(dataDirectory, "real-context.geojson"), `${JSON.stringify(context, null, 2)}\n`),
  writeFile(resolve(dataDirectory, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`)
]);

console.log(`重新规范化完成：${pois.features.length} 个 Point，${context.features.length} 个上下文对象`);
