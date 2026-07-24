import type {DisplayTransform, LocalPoint, MapPoint} from "./caseBundle";

export const EARTH_RADIUS_M = 6_378_137;
export const DISPLAY_ANCHOR = {
  longitude: 110.235,
  latitude: 18.625
} as const;

const RADIANS_PER_DEGREE = Math.PI / 180;
const POLE_COSINE_EPSILON = 1e-12;

export function createDisplayTransform(
  points: readonly LocalPoint[]
): DisplayTransform {
  if (points.length === 0) {
    throw new Error("点集不能为空");
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  points.forEach((point, index) => {
    validateLocalPoint(point, `点 ${index}`);
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  });

  return {
    anchorLongitude: DISPLAY_ANCHOR.longitude,
    anchorLatitude: DISPLAY_ANCHOR.latitude,
    sourceCenterXM: minX / 2 + maxX / 2,
    sourceCenterYM: minY / 2 + maxY / 2,
    xAxis: "EAST",
    yAxis: "NORTH"
  };
}

export function localToMapPoint(
  point: LocalPoint,
  transform: DisplayTransform
): MapPoint {
  validateLocalPoint(point, "local point");
  validateTransform(transform);

  const [xM, yM, zM] = point;
  const {anchorLongitude, anchorLatitude, sourceCenterXM, sourceCenterYM} = transform;
  const latitudeCosine = Math.cos(anchorLatitude * RADIANS_PER_DEGREE);
  const dxM = xM - sourceCenterXM;
  const dyM = yM - sourceCenterYM;
  validateFinite(dxM, "derived local delta X");
  validateFinite(dyM, "derived local delta Y");
  const longitude =
    anchorLongitude + dxM / (EARTH_RADIUS_M * latitudeCosine) / RADIANS_PER_DEGREE;
  const latitude = anchorLatitude + dyM / EARTH_RADIUS_M / RADIANS_PER_DEGREE;
  validateFinite(longitude, "derived display longitude");
  validateFinite(latitude, "derived display latitude");

  return [longitude, latitude, zM];
}

function validateLocalPoint(point: LocalPoint, label: string): void {
  const coordinateNames = ["X", "Y", "Z"] as const;

  coordinateNames.forEach((coordinateName, index) => {
    validateFinite(point[index], `${label} coordinate ${coordinateName}`);
  });
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function validateTransform(transform: DisplayTransform): void {
  const finiteFields: Array<[keyof DisplayTransform, number]> = [
    ["anchorLongitude", transform.anchorLongitude],
    ["anchorLatitude", transform.anchorLatitude],
    ["sourceCenterXM", transform.sourceCenterXM],
    ["sourceCenterYM", transform.sourceCenterYM]
  ];

  finiteFields.forEach(([field, value]) => {
    validateFinite(value, `display transform ${field}`);
  });

  if (transform.anchorLatitude < -90 || transform.anchorLatitude > 90) {
    throw new Error("display transform anchorLatitude must be within [-90, 90]");
  }

  if (Math.abs(Math.cos(transform.anchorLatitude * RADIANS_PER_DEGREE)) <= POLE_COSINE_EPSILON) {
    throw new Error("display transform anchorLatitude cannot be at or near a pole");
  }
}
