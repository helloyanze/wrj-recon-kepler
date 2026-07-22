import {processCsvData} from "@kepler.gl/processors";

export type UavFlightId = "UAV-01" | "UAV-02" | "UAV-03";

export type FlightCoordinate = readonly [
  longitude: number,
  latitude: number,
  altitude: number,
  timestamp: number
];

export interface UavFlightPath {
  uavId: UavFlightId;
  coordinates: readonly FlightCoordinate[];
}

const UAV_IDS: readonly UavFlightId[] = ["UAV-01", "UAV-02", "UAV-03"];
const UAV_ID_SET = new Set<string>(UAV_IDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUavFlightId(value: unknown): value is UavFlightId {
  return typeof value === "string" && UAV_ID_SET.has(value);
}

function parseCoordinate(value: unknown): FlightCoordinate | null {
  if (!Array.isArray(value) || value.length < 4) return null;

  const [longitude, latitude, altitude, timestamp] = value;
  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof altitude !== "number" ||
    !Number.isFinite(altitude) ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  return [longitude, latitude, altitude, timestamp];
}

function parseFeature(value: unknown): readonly FlightCoordinate[] | null {
  if (typeof value !== "string") return null;

  let feature: unknown;
  try {
    feature = JSON.parse(value) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(feature) || feature.type !== "Feature" || !isRecord(feature.geometry)) {
    return null;
  }
  if (feature.geometry.type !== "LineString" || !Array.isArray(feature.geometry.coordinates)) {
    return null;
  }

  const coordinates: FlightCoordinate[] = [];
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const value of feature.geometry.coordinates) {
    const coordinate = parseCoordinate(value);
    if (!coordinate || coordinate[3] <= previousTimestamp) return null;
    coordinates.push(coordinate);
    previousTimestamp = coordinate[3];
  }

  return coordinates.length >= 2 ? coordinates : null;
}

export function extractFlightPaths(raw: string): UavFlightPath[] {
  try {
    const processed = processCsvData(raw);
    if (!processed) return [];

    const geojsonIndex = processed.fields.findIndex(({name}) => name === "_geojson");
    const uavIdIndex = processed.fields.findIndex(({name}) => name === "uav_id");
    if (geojsonIndex < 0 || uavIdIndex < 0) return [];

    const pathsById = new Map<UavFlightId, UavFlightPath>();
    for (const row of processed.rows) {
      const uavId: unknown = row[uavIdIndex];
      if (!isUavFlightId(uavId) || pathsById.has(uavId)) continue;

      const coordinates = parseFeature(row[geojsonIndex]);
      if (coordinates) pathsById.set(uavId, {uavId, coordinates});
    }

    return UAV_IDS.flatMap((uavId) => {
      const path = pathsById.get(uavId);
      return path ? [path] : [];
    });
  } catch {
    return [];
  }
}
