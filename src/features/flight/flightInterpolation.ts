import type {FlightCoordinate, UavFlightId, UavFlightPath} from "./flightPaths";

export interface InterpolatedFlight {
  uavId: UavFlightId;
  position: readonly [longitude: number, latitude: number, altitude: number];
  heading: number;
}

const UAV_IDS = new Set<string>(["UAV-01", "UAV-02", "UAV-03"]);

function isCoordinate(value: unknown): value is FlightCoordinate {
  if (!Array.isArray(value) || value.length < 4) return false;
  const [longitude, latitude, altitude, timestamp] = value;
  return (
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof altitude === "number" &&
    Number.isFinite(altitude) &&
    typeof timestamp === "number" &&
    Number.isFinite(timestamp)
  );
}

function initialBearing(start: FlightCoordinate, end: FlightCoordinate): number {
  const degreesToRadians = Math.PI / 180;
  const startLatitude = start[1] * degreesToRadians;
  const endLatitude = end[1] * degreesToRadians;
  const longitudeDelta = (end[0] - start[0]) * degreesToRadians;
  const x = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const y =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
  const bearing = Math.atan2(x, y) / degreesToRadians;
  return (bearing + 360) % 360;
}

function interpolateLongitude(start: number, end: number, ratio: number): number {
  const shortestDelta = ((end - start + 540) % 360) - 180;
  const longitude = start + shortestDelta * ratio;
  return ((longitude + 540) % 360) - 180;
}

function resultAt(
  uavId: UavFlightId,
  coordinate: FlightCoordinate,
  headingStart: FlightCoordinate,
  headingEnd: FlightCoordinate
): InterpolatedFlight {
  return {
    uavId,
    position: [coordinate[0], coordinate[1], coordinate[2]],
    heading: initialBearing(headingStart, headingEnd)
  };
}

export function interpolateFlight(
  path: UavFlightPath,
  time: number
): InterpolatedFlight | null {
  const candidate = path as UavFlightPath | null | undefined;
  if (
    !candidate ||
    !UAV_IDS.has(candidate.uavId) ||
    !Array.isArray(candidate.coordinates) ||
    candidate.coordinates.length === 0 ||
    !Number.isFinite(time)
  ) {
    return null;
  }

  const coordinates = candidate.coordinates;
  if (coordinates.length === 1) {
    const coordinate: unknown = coordinates[0];
    if (!isCoordinate(coordinate)) return null;
    return {
      uavId: candidate.uavId,
      position: [coordinate[0], coordinate[1], coordinate[2]],
      heading: 0
    };
  }

  const first: unknown = coordinates[0];
  const second: unknown = coordinates[1];
  const penultimate: unknown = coordinates[coordinates.length - 2];
  const last: unknown = coordinates[coordinates.length - 1];
  if (
    !isCoordinate(first) ||
    !isCoordinate(second) ||
    !isCoordinate(penultimate) ||
    !isCoordinate(last) ||
    second[3] <= first[3] ||
    last[3] <= penultimate[3]
  ) {
    return null;
  }

  if (time <= first[3]) return resultAt(candidate.uavId, first, first, second);
  if (time >= last[3]) return resultAt(candidate.uavId, last, penultimate, last);

  let lowerIndex = 0;
  let upperIndex = coordinates.length - 1;
  while (lowerIndex + 1 < upperIndex) {
    const midpoint = lowerIndex + Math.floor((upperIndex - lowerIndex) / 2);
    const midpointCoordinate: unknown = coordinates[midpoint];
    if (!isCoordinate(midpointCoordinate)) return null;
    if (midpointCoordinate[3] <= time) lowerIndex = midpoint;
    else upperIndex = midpoint;
  }

  const start: unknown = coordinates[lowerIndex];
  const end: unknown = coordinates[upperIndex];
  if (!isCoordinate(start) || !isCoordinate(end) || end[3] <= start[3]) return null;

  const ratio = (time - start[3]) / (end[3] - start[3]);
  return {
    uavId: candidate.uavId,
    position: [
      interpolateLongitude(start[0], end[0], ratio),
      start[1] + (end[1] - start[1]) * ratio,
      start[2] + (end[2] - start[2]) * ratio
    ],
    heading: initialBearing(start, end)
  };
}
