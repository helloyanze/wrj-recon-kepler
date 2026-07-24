export const WRJ_MAP_ID = "wrj-map";
export const MIN_CASE_MAP_ZOOM = 4;
export const MAX_CASE_MAP_ZOOM = 14;
export const ZERO_EXTENT_CASE_MAP_ZOOM = 12;

export const DEFAULT_MAP_STATE = {
  latitude: 18.625,
  longitude: 110.235,
  zoom: 12.7,
  pitch: 52,
  bearing: -18,
  dragRotate: true
} as const;

export const UAV_COLORS = {
  "UAV-01": "#35C5FF",
  "UAV-02": "#FFB44D",
  "UAV-03": "#4ED6A0"
} as const;
