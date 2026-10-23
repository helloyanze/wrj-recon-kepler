import {mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {FetchSource, PMTiles} from "pmtiles";

// Protomaps 每日构建（PMTiles），仅按 bbox 提取所需瓦片，数据来自 OpenStreetMap（ODbL）。
const DEFAULT_SOURCE_URL = "https://build.protomaps.com/20240624.pmtiles";
const SOURCE_URL = process.env.PROTOMAPS_PMTILES_URL ?? DEFAULT_SOURCE_URL;
const SOURCE_MIN_ZOOM = 4;
const SOURCE_MAX_ZOOM = 14;
// 低缩放覆盖初始广域视角，高缩放只覆盖任务区域，避免瓦片数量失控。
const TILE_TIERS = [
  {
    minZoom: 4,
    maxZoom: 8,
    bbox: {south: 14, west: 105, north: 23, east: 116}
  },
  {
    minZoom: 9,
    maxZoom: 11,
    bbox: {south: 18.15, west: 109.5, north: 19.1, east: 110.95}
  },
  {
    minZoom: 12,
    maxZoom: 14,
    bbox: {south: 18.38, west: 109.92, north: 18.87, east: 110.55}
  }
];
const CONCURRENCY = 8;
const ATTRIBUTION = "© OpenStreetMap contributors · Protomaps";
const GLYPH_FONT_STACK = "Noto Sans Regular";
const GLYPH_SOURCE_URL = "https://demotiles.maplibre.org/font/Noto%20Sans%20Regular";
// CJK 由 MapLibre 使用系统字体本地渲染，这里只需 Latin、越南语和标点字形。
const GLYPH_RANGES = [
  "0-255",
  "256-511",
  "512-767",
  "768-1023",
  "7680-7935",
  "8192-8447",
  "12288-12543",
  "65280-65535"
];
const GLYPHS_PATH = "/offline-basemap/glyphs/{fontstack}/{range}.pbf";
const NAME_FIELD = ["coalesce", ["get", "name:zh"], ["get", "name"], ["get", "name:en"], ""];
const STYLES_ONLY = process.argv.includes("--styles-only");

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectRoot, "public/offline-basemap");
const tilesDirectory = resolve(outputDirectory, "tiles");

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  const mercator = Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI;
  return Math.floor(((1 - mercator) / 2) * 2 ** zoom);
}

function tileJobs() {
  const jobs = [];
  const seen = new Set();
  for (const tier of TILE_TIERS) {
    for (let z = tier.minZoom; z <= tier.maxZoom; z += 1) {
      const xMin = lonToTileX(tier.bbox.west, z);
      const xMax = lonToTileX(tier.bbox.east, z);
      const yMin = latToTileY(tier.bbox.north, z);
      const yMax = latToTileY(tier.bbox.south, z);
      for (let x = xMin; x <= xMax; x += 1) {
        for (let y = yMin; y <= yMax; y += 1) {
          const key = `${z}/${x}/${y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          jobs.push({z, x, y});
        }
      }
    }
  }
  return jobs;
}

async function fetchTile(archive, {z, x, y}, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await archive.getZxy(z, x, y);
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 600 * attempt));
    }
  }
  return undefined;
}

async function extractTiles(archive) {
  const jobs = tileJobs();
  console.log(`候选瓦片 ${jobs.length} 个（z${SOURCE_MIN_ZOOM}–z${SOURCE_MAX_ZOOM}，分级覆盖）`);
  let cursor = 0;
  let written = 0;
  let bytes = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const tile = await fetchTile(archive, job);
      if (!tile?.data || tile.data.byteLength === 0) continue;
      const directory = resolve(tilesDirectory, String(job.z), String(job.x));
      await mkdir(directory, {recursive: true});
      await writeFile(resolve(directory, `${job.y}.mvt`), Buffer.from(tile.data));
      written += 1;
      bytes += tile.data.byteLength;
      if (written % 50 === 0) process.stdout.write(`\r已写入 ${written} 个瓦片`);
    }
  }

  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  console.log(`\r已写入 ${written} 个瓦片，共 ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  return {written, bytes};
}

const DARK = {
  background: "#0d1117",
  earth: "#141a22",
  water: "#0a1420",
  wood: "#15221b",
  sand: "#26251c",
  residential: "#171d26",
  commercial: "#1a202a",
  industrial: "#1a1e25",
  farmland: "#161b20",
  park: "#16241d",
  buildings: "#1f2733",
  roadCasing: "#0a0e14",
  road: "#2b3442",
  roadMajor: "#3b4655",
  rail: "#2b323d",
  boundary: "#3a4250",
  river: "#0e1b2c",
  label: "#d8e2ee",
  labelHalo: "#0b1118",
  waterLabel: "#7fb2d2",
  waterLabelHalo: "#071018"
};

const LIGHT = {
  background: "#eceae4",
  earth: "#f6f4ef",
  water: "#d5e3ea",
  wood: "#dce8d4",
  sand: "#f1e9d4",
  residential: "#efede8",
  commercial: "#f0ece6",
  industrial: "#eae8e3",
  farmland: "#eef0e3",
  park: "#dcead5",
  buildings: "#e2ded5",
  roadCasing: "#d4d0c7",
  road: "#ffffff",
  roadMajor: "#fffdf7",
  rail: "#cfcac1",
  boundary: "#bdb8ae",
  river: "#c9dce6",
  label: "#2f353c",
  labelHalo: "#ffffff",
  waterLabel: "#3c6d8c",
  waterLabelHalo: "#ffffff"
};

function landuseColor(colors) {
  return [
    "match", ["get", "pmap:kind"],
    "park", colors.park,
    "national_park", colors.park,
    "nature_reserve", colors.park,
    "wood", colors.wood,
    "forest", colors.wood,
    "beach", colors.sand,
    "sand", colors.sand,
    "farmland", colors.farmland,
    "farm", colors.farmland,
    "commercial", colors.commercial,
    "industrial", colors.industrial,
    "railway", colors.industrial,
    "residential", colors.residential,
    colors.residential
  ];
}

function naturalColor(colors) {
  return [
    "match", ["get", "pmap:kind"],
    "wood", colors.wood,
    "scrub", colors.wood,
    "sand", colors.sand,
    "beach", colors.sand,
    "glacier", colors.background,
    colors.wood
  ];
}

function roadWidth(extra = 0) {
  return [
    "interpolate", ["exponential", 1.5], ["zoom"],
    9, [
      "match", ["get", "pmap:kind"],
      "highway", 1.1 + extra,
      "medium_road", 0.7 + extra,
      "minor_road", 0.45 + extra,
      0.3 + extra
    ],
    14, [
      "match", ["get", "pmap:kind"],
      "highway", 5.5 + extra,
      "medium_road", 2.8 + extra,
      "minor_road", 1.4 + extra,
      0.9 + extra
    ]
  ];
}

function buildStyle(theme) {
  const colors = theme === "dark" ? DARK : LIGHT;
  return {
    version: 8,
    name: `WRJ Offline ${theme === "dark" ? "Dark" : "Light"}`,
    glyphs: GLYPHS_PATH,
    sources: {
      protomaps: {
        type: "vector",
        tiles: ["/offline-basemap/tiles/{z}/{x}/{y}.mvt"],
        minzoom: SOURCE_MIN_ZOOM,
        maxzoom: SOURCE_MAX_ZOOM,
        attribution: ATTRIBUTION
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {"background-color": colors.background}
      },
      {
        id: "earth",
        type: "fill",
        source: "protomaps",
        "source-layer": "earth",
        paint: {"fill-color": colors.earth}
      },
      {
        id: "natural",
        type: "fill",
        source: "protomaps",
        "source-layer": "natural",
        paint: {"fill-color": naturalColor(colors)}
      },
      {
        id: "landuse",
        type: "fill",
        source: "protomaps",
        "source-layer": "landuse",
        paint: {"fill-color": landuseColor(colors), "fill-opacity": 0.85}
      },
      {
        id: "water",
        type: "fill",
        source: "protomaps",
        "source-layer": "water",
        paint: {"fill-color": colors.water}
      },
      {
        id: "physical-line",
        type: "line",
        source: "protomaps",
        "source-layer": "physical_line",
        paint: {
          "line-color": colors.river,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.8]
        }
      },
      {
        id: "transit",
        type: "line",
        source: "protomaps",
        "source-layer": "transit",
        minzoom: 11,
        paint: {
          "line-color": colors.rail,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 14, 1.5],
          "line-dasharray": [2, 2]
        }
      },
      {
        id: "buildings",
        type: "fill",
        source: "protomaps",
        "source-layer": "buildings",
        minzoom: 14,
        paint: {"fill-color": colors.buildings}
      },
      {
        id: "roads-casing",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        paint: {
          "line-color": colors.roadCasing,
          "line-width": roadWidth(1.6),
          "line-opacity": 0.85
        }
      },
      {
        id: "roads",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        layout: {"line-cap": "round", "line-join": "round"},
        paint: {
          "line-color": [
            "match", ["get", "pmap:kind"],
            "highway", colors.roadMajor,
            "medium_road", colors.road,
            colors.road
          ],
          "line-width": roadWidth()
        }
      },
      {
        id: "boundaries",
        type: "line",
        source: "protomaps",
        "source-layer": "boundaries",
        paint: {
          "line-color": colors.boundary,
          "line-width": 1,
          "line-dasharray": [3, 2],
          "line-opacity": 0.6
        }
      },
      {
        id: "water-area-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "physical_point",
        minzoom: 7,
        filter: ["in", ["get", "pmap:kind"], ["literal", ["sea", "strait", "bay", "lake", "water"]]],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 12, 12, 16, 14],
          "text-letter-spacing": 0.06,
          "text-max-width": 8,
          "text-padding": 4,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.waterLabel,
          "text-halo-color": colors.waterLabelHalo,
          "text-halo-width": 1.2,
          "text-opacity": 0.92
        }
      },
      {
        id: "river-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "physical_line",
        minzoom: 10,
        filter: ["in", ["get", "pmap:kind"], ["literal", ["river", "canal"]]],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "symbol-placement": "line",
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11],
          "text-letter-spacing": 0.05,
          "text-keep-upright": true,
          "text-padding": 2
        },
        paint: {
          "text-color": colors.waterLabel,
          "text-halo-color": colors.waterLabelHalo,
          "text-halo-width": 1,
          "text-opacity": 0.88
        }
      },
      {
        id: "place-village-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 11,
        filter: [
          "any",
          [
            "all",
            ["==", ["get", "pmap:kind"], "locality"],
            ["in", ["get", "pmap:kind_detail"], ["literal", ["village", "hamlet", "suburb", "locality"]]]
          ],
          ["==", ["get", "pmap:kind"], "neighbourhood"]
        ],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, 11],
          "text-max-width": 8,
          "text-padding": 3,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.labelHalo,
          "text-halo-width": 1.2,
          "text-opacity": 0.88
        }
      },
      {
        id: "place-town-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 8.5,
        filter: [
          "all",
          ["==", ["get", "pmap:kind"], "locality"],
          ["==", ["get", "pmap:kind_detail"], "town"]
        ],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 12, 16, 14],
          "text-max-width": 8,
          "text-padding": 4,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.labelHalo,
          "text-halo-width": 1.3,
          "text-opacity": 0.92
        }
      },
      {
        id: "place-city-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 7,
        filter: [
          "all",
          ["==", ["get", "pmap:kind"], "locality"],
          ["==", ["get", "pmap:kind_detail"], "city"]
        ],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 11, 14, 16, 17],
          "text-max-width": 8,
          "text-padding": 5,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.labelHalo,
          "text-halo-width": 1.4,
          "text-opacity": 0.96
        }
      },
      {
        id: "place-region-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 5,
        filter: ["==", ["get", "pmap:kind"], "region"],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 9, 12, 13, 15],
          "text-letter-spacing": 0.04,
          "text-max-width": 8,
          "text-padding": 6,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.labelHalo,
          "text-halo-width": 1.4,
          "text-opacity": 0.9
        }
      },
      {
        id: "place-country-labels",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 3,
        filter: ["==", ["get", "pmap:kind"], "country"],
        layout: {
          "text-field": NAME_FIELD,
          "text-font": [GLYPH_FONT_STACK],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 6, 15, 10, 18],
          "text-letter-spacing": 0.08,
          "text-max-width": 8,
          "text-padding": 6,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": colors.label,
          "text-halo-color": colors.labelHalo,
          "text-halo-width": 1.6,
          "text-opacity": 0.92
        }
      }
    ]
  };
}

async function downloadGlyphs() {
  const glyphDirectory = resolve(outputDirectory, "glyphs", GLYPH_FONT_STACK);
  await mkdir(glyphDirectory, {recursive: true});
  let bytes = 0;

  for (const range of GLYPH_RANGES) {
    const file = resolve(glyphDirectory, `${range}.pbf`);
    try {
      const existing = await readFile(file);
      if (existing.byteLength > 0) {
        bytes += existing.byteLength;
        continue;
      }
    } catch {
      // 文件不存在时下载。
    }

    let response;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch(`${GLYPH_SOURCE_URL}/${range}.pbf`);
        if (response.ok) break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
      if (attempt < 3) await new Promise(resolveDelay => setTimeout(resolveDelay, 500 * attempt));
    }
    if (!response?.ok) {
      throw new Error(`字形下载失败 ${range}：HTTP ${response?.status ?? "unknown"}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(file, buffer);
    bytes += buffer.byteLength;
  }

  console.log(`字形切片 ${GLYPH_RANGES.length} 个，${(bytes / 1024).toFixed(0)} KB`);
  return bytes;
}

async function main() {
  let written;
  let bytes;
  let previousProvenance = null;

  if (STYLES_ONLY) {
    previousProvenance = JSON.parse(
      await readFile(resolve(outputDirectory, "provenance.json"), "utf8")
    );
    written = previousProvenance.tileCount;
    bytes = previousProvenance.tileBytes;
    console.log("仅重建样式与字形，保留现有瓦片");
  } else {
    console.log(`数据源：${SOURCE_URL}`);
    const archive = new PMTiles(new FetchSource(SOURCE_URL));
    const header = await archive.getHeader();
    if (header.maxZoom < SOURCE_MAX_ZOOM) {
      throw new Error(`数据源最大缩放级别为 ${header.maxZoom}，低于所需 ${SOURCE_MAX_ZOOM}`);
    }

    await rm(outputDirectory, {recursive: true, force: true});
    await mkdir(tilesDirectory, {recursive: true});

    ({written, bytes} = await extractTiles(archive));
    if (written === 0) throw new Error("未提取到任何瓦片，请检查 bbox 与数据源");
  }

  const glyphBytes = await downloadGlyphs();
  const styles = {
    "style-dark.json": buildStyle("dark"),
    "style-light.json": buildStyle("light")
  };
  await Promise.all([
    ...Object.entries(styles).map(([file, style]) => (
      writeFile(resolve(outputDirectory, file), `${JSON.stringify(style, null, 2)}\n`)
    )),
    writeFile(resolve(outputDirectory, "provenance.json"), `${JSON.stringify({
      ...(previousProvenance ?? {}),
      source: "Protomaps Basemap (OpenStreetMap)",
      sourceUrl: SOURCE_URL,
      retrievedAt: previousProvenance?.retrievedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tiers: TILE_TIERS,
      zoomRange: {min: SOURCE_MIN_ZOOM, max: SOURCE_MAX_ZOOM},
      tileCount: written,
      tileBytes: bytes,
      tileUrl: "/offline-basemap/tiles/{z}/{x}/{y}.mvt",
      styles: Object.keys(styles),
      glyphs: {
        fontStack: GLYPH_FONT_STACK,
        ranges: GLYPH_RANGES,
        sourceUrl: GLYPH_SOURCE_URL,
        bytes: glyphBytes,
        license: "SIL Open Font License 1.1（Noto Sans）"
      },
      license: "ODbL 1.0（地图数据）",
      attribution: ATTRIBUTION,
      note: "深色/亮色样式含国家、省/州、城镇、乡村、海湾和河流标注；CJK 由 MapLibre 使用系统字体本地渲染，Latin/越南语/标点字形使用本地 Noto Sans 切片。"
    }, null, 2)}\n`)
  ]);
  console.log("离线底图已生成：public/offline-basemap/");
}

await main();
