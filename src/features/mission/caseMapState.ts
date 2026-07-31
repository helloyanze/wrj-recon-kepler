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
  const points: MapPoint[] = [
    ...bundle.region.polygon,
    ...bundle.strips.flatMap(({line, polygon}) => [...line, ...polygon]),
    ...bundle.sorties.flatMap(({trip}) =>
      trip.map(([longitude, latitude, altitudeM]) =>
        [longitude, latitude, altitudeM] as MapPoint
      )
    )
  ];
  const state = mapStateForPoints(points, [
    bundle.displayTransform.anchorLongitude,
    bundle.displayTransform.anchorLatitude
  ]);
  return {
    ...state,
    longitude: bundle.displayTransform.anchorLongitude,
    latitude: bundle.displayTransform.anchorLatitude
  };
}

export function mapStateForPoints(
  points: readonly MapPoint[],
  fallbackCenter: readonly [longitude: number, latitude: number]
): CaseMapState {
  const bounds = calculateBounds(points);
  const longitude = bounds === null
    ? fallbackCenter[0]
    : (bounds.minimumLongitude + bounds.maximumLongitude) / 2;
  const latitude = bounds === null
    ? fallbackCenter[1]
    : (bounds.minimumLatitude + bounds.maximumLatitude) / 2;
  const horizontalExtentM = bounds === null
    ? 0
    : calculateHorizontalExtentM(bounds, latitude);
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

interface MapBounds {
  minimumLongitude: number;
  maximumLongitude: number;
  minimumLatitude: number;
  maximumLatitude: number;
}

function calculateBounds(points: readonly MapPoint[]): MapBounds | null {
  if (points.length === 0) return null;

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
  return {
    minimumLongitude,
    maximumLongitude,
    minimumLatitude,
    maximumLatitude
  };
}

function calculateHorizontalExtentM(
  bounds: MapBounds,
  centerLatitude: number
): number {
  const longitudeMetresPerDegree =
    METRES_PER_LATITUDE_DEGREE * Math.cos(centerLatitude * Math.PI / 180);
  const widthM =
    Math.abs(bounds.maximumLongitude - bounds.minimumLongitude) *
    longitudeMetresPerDegree;
  const heightM =
    Math.abs(bounds.maximumLatitude - bounds.minimumLatitude) *
    METRES_PER_LATITUDE_DEGREE;
  return Math.max(widthM, heightM);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
