import {IconLayer} from "@deck.gl/layers";
import {UAV_COLORS} from "../../kepler/constants";
import {interpolateFlight, type InterpolatedFlight} from "./flightInterpolation";
import type {UavFlightId, UavFlightPath} from "./flightPaths";

export type UavMarkerColor = [red: number, green: number, blue: number, alpha: number];

export interface UavDeckMarker extends InterpolatedFlight {
  color: UavMarkerColor;
}

export interface CreateUavDeckLayersOptions {
  paths: readonly UavFlightPath[];
  time: number | null;
  visible: boolean;
  palette?: readonly string[];
  iconSize?: number;
}

const DEFAULT_PALETTE = [
  UAV_COLORS["UAV-01"],
  UAV_COLORS["UAV-02"],
  UAV_COLORS["UAV-03"]
] as const;

const PALETTE_INDEX_BY_UAV_ID: Record<UavFlightId, number> = {
  "UAV-01": 0,
  "UAV-02": 1,
  "UAV-03": 2
};

const UAV_ICON = {
  url: "/assets/uav-fixed-wing-mask.svg",
  width: 64,
  height: 64,
  anchorY: 32,
  mask: true
} as const;

function hexToRgba(hex: string): UavMarkerColor {
  const normalized = hex.slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255
  ];
}

function paletteColor(palette: readonly string[] | undefined, uavId: UavFlightId): UavMarkerColor {
  const index = PALETTE_INDEX_BY_UAV_ID[uavId];
  const candidate = palette?.[index];
  const fallback = DEFAULT_PALETTE[index];
  return hexToRgba(typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback);
}

export function createUavDeckLayers({
  paths,
  time,
  visible,
  palette,
  iconSize = 32
}: CreateUavDeckLayersOptions) {
  if (!visible) return [];

  const markers = paths.flatMap((path) => {
    const pathTime = time ?? path.coordinates[0]?.[3] ?? Number.NaN;
    const flight = interpolateFlight(path, pathTime);
    return flight ? [{...flight, color: paletteColor(palette, path.uavId)}] : [];
  });

  if (markers.length === 0) return [];

  return [
    new IconLayer<UavDeckMarker>({
      id: "wrj-uav-flight-markers",
      data: markers,
      pickable: false,
      billboard: true,
      sizeUnits: "pixels",
      getPosition: (marker) => [marker.position[0], marker.position[1], marker.position[2]],
      getAngle: (marker) => marker.heading,
      getColor: (marker) => [...marker.color],
      getSize: () => iconSize,
      getIcon: () => UAV_ICON
    })
  ];
}
