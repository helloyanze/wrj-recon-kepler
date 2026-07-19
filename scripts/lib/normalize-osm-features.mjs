const TARGET_TAGS = [
  "name",
  "natural",
  "tourism",
  "amenity",
  "man_made",
  "place",
  "seamark:type",
  "harbour",
  "leisure",
  "building",
  "highway"
];

function hasTargetTag(tags) {
  return TARGET_TAGS.some((key) => tags[key]);
}

function coordinateInBounds([longitude, latitude], bbox) {
  return (
    Number.isFinite(longitude) && Number.isFinite(latitude) &&
    longitude >= bbox.west && longitude <= bbox.east &&
    latitude >= bbox.south && latitude <= bbox.north
  );
}

function geometryInBounds(geometry, bbox) {
  const coordinates = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates;
  return coordinates.length > 0 && coordinates.every((coordinate) => coordinateInBounds(coordinate, bbox));
}

function categoryOf(tags) {
  for (const key of TARGET_TAGS.slice(1)) {
    if (tags[key]) return `${key.replace(":", "_")}_${tags[key]}`;
  }
  return tags.name ? "named_place" : "other";
}

function centerOf(element) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return [element.lon, element.lat];
  }
  if (Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat)) {
    return [element.center.lon, element.center.lat];
  }
  if (Array.isArray(element.geometry) && element.geometry.length > 0) {
    const sum = element.geometry.reduce(
      (value, point) => [value[0] + point.lon, value[1] + point.lat],
      [0, 0]
    );
    return [sum[0] / element.geometry.length, sum[1] / element.geometry.length];
  }
  return null;
}

function propertiesOf(element, retrievedAt, geometryOrigin) {
  const tags = element.tags ?? {};
  return {
    dataNature: "REAL_PUBLIC_GEODATA",
    sourceName: "OpenStreetMap",
    sourceType: element.type,
    sourceId: String(element.id),
    sourceRef: `${element.type}/${element.id}`,
    retrievedAt,
    name: tags.name ?? null,
    category: categoryOf(tags),
    geometryOrigin,
    osmTags: tags,
    verifiedForDemo: false,
    verificationNote: "已完成查询边界与原始标签自动校验，待底图目视复核"
  };
}

function geometryOf(element) {
  if (!Array.isArray(element.geometry) || element.geometry.length < 2) return null;
  const coordinates = element.geometry.map(({lon, lat}) => [lon, lat]);
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const isClosed = first[0] === last[0] && first[1] === last[1];
  const isArea = Boolean(element.tags?.building || element.tags?.leisure || isClosed);
  if (isArea && isClosed && coordinates.length >= 4) {
    return {type: "Polygon", coordinates: [coordinates]};
  }
  return {type: "LineString", coordinates};
}

export function normalizeOverpassData(raw, retrievedAt, bbox) {
  if (!bbox) throw new Error("规范化真实 OSM 数据时必须提供查询边界");
  const pois = [];
  const context = [];

  for (const element of raw.elements ?? []) {
    const tags = element.tags ?? {};
    const center = centerOf(element);
    const geometry = geometryOf(element);
    const original = Number.isFinite(element.lon) && Number.isFinite(element.lat);
    const derivedGeometryIsValid = !geometry || geometryInBounds(geometry, bbox);
    if (
      center && hasTargetTag(tags) && coordinateInBounds(center, bbox) &&
      (original || derivedGeometryIsValid)
    ) {
      pois.push({
        type: "Feature",
        geometry: {type: "Point", coordinates: center},
        properties: propertiesOf(element, retrievedAt, original ? "original" : "center-derived")
      });
    }

    if (geometry && hasTargetTag(tags) && geometryInBounds(geometry, bbox)) {
      context.push({
        type: "Feature",
        geometry,
        properties: propertiesOf(element, retrievedAt, "original")
      });
    }
  }

  return {
    pois: {type: "FeatureCollection", features: pois},
    context: {type: "FeatureCollection", features: context}
  };
}
