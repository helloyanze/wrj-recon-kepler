import type {CaseBundleV2, MapPoint} from "../cases/caseBundle";
import {
  MAX_CASE_MAP_ZOOM,
  MIN_CASE_MAP_ZOOM,
  ZERO_EXTENT_CASE_MAP_ZOOM
} from "../../kepler/constants";

const METRES_PER_LATITUDE_DEGREE = 111_320;
const REFERENCE_EXTENT_M = 1_000;
const REFERENCE_ZOOM = 14;

export interface CaseMapState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: 55;
  bearing: -18;
  dragRotate: true;
}

export function caseMapState(bundle: CaseBundleV2): CaseMapState {
  const {
    anchorLatitude: latitude,
    anchorLongitude: longitude
  } = bundle.displayTransform;
  const horizontalExtentM = calculateHorizontalExtentM(bundle, latitude);
  const zoom = horizontalExtentM === 0
    ? ZERO_EXTENT_CASE_MAP_ZOOM
    : clamp(
      REFERENCE_ZOOM - Math.log2(horizontalExtentM / REFERENCE_EXTENT_M),
      MIN_CASE_MAP_ZOOM,
      MAX_CASE_MAP_ZOOM
    );

  return {
    latitude,
    longitude,
    zoom,
    pitch: 55,
    bearing: -18,
    dragRotate: true
  };
}

function calculateHorizontalExtentM(
  bundle: CaseBundleV2,
  anchorLatitude: number
): number {
  const points: MapPoint[] = [
    ...bundle.region.polygon,
    ...bundle.strips.flatMap(({line, polygon}) => [...line, ...polygon]),
    ...bundle.sorties.flatMap(({trip}) =>
      trip.map(([longitude, latitude, altitudeM]) =>
        [longitude, latitude, altitudeM] as MapPoint
      )
    )
  ];
  if (points.length === 0) return 0;

  let minimumLongitude = Number.POSITIVE_INFINITY;
  let maximumLongitude = Number.NEGATIVE_INFINITY;
  let minimumLatitude = Number.POSITIVE_INFINITY;
  let maximumLatitude = Number.NEGATIVE_INFINITY;
  for (const [longitude, latitude] of points) {
    minimumLongitude = Math.min(minimumLongitude, longitude);
    maximumLongitude = Math.max(maximumLongitude, longitude);
    minimumLatitude = Math.min(minimumLatitude, latitude);
    maximumLatitude = Math.max(maximumLatitude, latitude);
  }

  const longitudeMetresPerDegree =
    METRES_PER_LATITUDE_DEGREE * Math.cos(anchorLatitude * Math.PI / 180);
  const widthM =
    Math.abs(maximumLongitude - minimumLongitude) * longitudeMetresPerDegree;
  const heightM =
    Math.abs(maximumLatitude - minimumLatitude) * METRES_PER_LATITUDE_DEGREE;
  return Math.max(widthM, heightM);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
