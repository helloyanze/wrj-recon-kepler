import {TripsLayer} from "@deck.gl/geo-layers";
import {IconLayer, PathLayer, PolygonLayer} from "@deck.gl/layers";
import type {
  CaseBundleV2,
  MapPoint,
  NormalizedSortie
} from "../cases/caseBundle";
import {
  selectSortieStates,
  type LiveSortieState
} from "./missionInterpolation";
import type {
  MissionLayerPreferencesV2,
  VerticalScale
} from "./missionLayerPreferences";

export interface MissionDeckLayerOptions {
  bundle: CaseBundleV2;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV2;
  onSelectSortie?: (assignmentId: string) => void;
}

type DeckColor = [red: number, green: number, blue: number, alpha: number];

interface RegionDatum {
  polygon: CaseBundleV2["region"]["polygon"];
}

type StripDatum = CaseBundleV2["strips"][number];

interface MarkerDatum extends LiveSortieState {
  position: readonly [longitude: number, latitude: number, altitudeM: number];
  color: DeckColor;
}

const REGION_FILL_COLOR: DeckColor = [53, 197, 255, 255];
const REGION_LINE_COLOR: DeckColor = [104, 220, 255, 255];
const FALLBACK_UAV_COLOR = "#FFFFFF";
const LANDED_DURATION_SEC = 3;

const UAV_ICON = {
  url: "/assets/uav-triangle-mask.svg",
  width: 64,
  height: 64,
  anchorY: 32,
  mask: true
} as const;

export function createMissionDeckLayers({
  bundle,
  missionTimeSec,
  verticalScale,
  preferences,
  onSelectSortie
}: MissionDeckLayerOptions) {
  const regionPreference = preferences.layers.region;
  const stripPreference = preferences.layers.strips;
  const routePreference = preferences.layers.routes;
  const tripPreference = preferences.layers.trips;
  const colorForUav = (uavId: string): DeckColor =>
    hexToRgba(preferences.uavColors[uavId] ?? FALLBACK_UAV_COLOR);
  const uavColorKey = Object.entries(preferences.uavColors)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, color]) => `${id}:${color}`)
    .join("|");
  const selectable = <T extends {assignmentId: string}>() =>
    selectionProps<T>(onSelectSortie);

  const liveMarkers: MarkerDatum[] = selectSortieStates(
    bundle.sorties,
    missionTimeSec
  ).flatMap(state => {
    if (
      (state.status !== "flying" && state.status !== "landed") ||
      state.position === null
    ) {
      return [];
    }

    const color = colorForUav(state.uavId);
    const alpha = state.status === "landed"
      ? landedAlpha(bundle.sorties, state.assignmentId, missionTimeSec)
      : 255;
    return [{
      ...state,
      position: scalePoint(state.position, verticalScale),
      color: [color[0], color[1], color[2], alpha]
    }];
  });

  return [
    new PolygonLayer<RegionDatum>({
      id: "wrj-algorithm-region",
      data: [{polygon: bundle.region.polygon}],
      visible: regionPreference.visible,
      opacity: regionPreference.opacity,
      pickable: false,
      filled: regionPreference.filled ?? true,
      stroked: regionPreference.stroked ?? true,
      getPolygon: ({polygon}) => polygon.map(seaLevelPoint),
      getFillColor: REGION_FILL_COLOR,
      getLineColor: REGION_LINE_COLOR,
      lineWidthMinPixels: 1
    }),
    new PathLayer<StripDatum>({
      id: "wrj-algorithm-strips",
      data: bundle.strips,
      visible: stripPreference.visible,
      opacity: stripPreference.opacity,
      pickable: true,
      widthUnits: "pixels",
      getWidth: stripPreference.width ?? 2,
      getPath: ({line}) => line.map(seaLevelPoint),
      getColor: ({uavId}) => colorForUav(uavId),
      updateTriggers: {getColor: uavColorKey},
      ...selectable<StripDatum>()
    }),
    new PathLayer<NormalizedSortie>({
      id: "wrj-algorithm-routes",
      data: bundle.sorties,
      visible: routePreference.visible,
      opacity: routePreference.opacity,
      pickable: true,
      widthUnits: "pixels",
      getWidth: routePreference.width ?? 2,
      getPath: ({trip}) => trip.map(point =>
        scalePoint(point, verticalScale)
      ),
      getColor: ({uavId}) => colorForUav(uavId),
      updateTriggers: {getColor: uavColorKey},
      ...selectable<NormalizedSortie>()
    }),
    new TripsLayer<NormalizedSortie>({
      id: "wrj-algorithm-trips",
      data: bundle.sorties,
      visible: tripPreference.visible,
      opacity: tripPreference.opacity,
      pickable: true,
      widthUnits: "pixels",
      getWidth: tripPreference.width ?? 4,
      currentTime: missionTimeSec,
      trailLength: tripPreference.trailLengthSec ?? 240,
      getPath: ({trip}) => trip.map(point =>
        scalePoint(point, verticalScale)
      ),
      getTimestamps: ({trip}) => trip.map(point => point[3]),
      getColor: ({uavId}) => colorForUav(uavId),
      updateTriggers: {getColor: uavColorKey},
      ...selectable<NormalizedSortie>()
    }),
    new IconLayer<MarkerDatum>({
      id: "wrj-algorithm-uav-triangles",
      data: liveMarkers,
      visible: tripPreference.visible,
      opacity: tripPreference.opacity,
      pickable: true,
      billboard: false,
      sizeUnits: "pixels",
      getPosition: ({position}) => [position[0], position[1], position[2]],
      getAngle: ({headingDeg}) => headingDeg === null ? 0 : -headingDeg,
      getColor: ({color}) => color,
      getSize: () => preferences.markerSize,
      getIcon: () => UAV_ICON,
      ...selectable<MarkerDatum>()
    })
  ];
}

function selectionProps<T extends {assignmentId: string}>(
  onSelectSortie: ((assignmentId: string) => void) | undefined
): {onClick?: (info: {object?: T | null}) => void} {
  if (onSelectSortie === undefined) return {};
  return {
    onClick: ({object}) => {
      if (object !== undefined && object !== null) {
        onSelectSortie(object.assignmentId);
      }
    }
  };
}

function scalePoint(
  point: readonly [number, number, number, ...unknown[]],
  verticalScale: VerticalScale
): [number, number, number] {
  return [point[0], point[1], point[2] * verticalScale];
}

function seaLevelPoint(point: MapPoint): [number, number, number] {
  return [point[0], point[1], 0];
}

function hexToRgba(hex: string): DeckColor {
  const value = /^#[0-9A-F]{6}$/i.test(hex)
    ? hex.slice(1)
    : FALLBACK_UAV_COLOR.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255
  ];
}

function landedAlpha(
  sorties: readonly NormalizedSortie[],
  assignmentId: string,
  missionTimeSec: number
): number {
  const sortie = sorties.find(item => item.assignmentId === assignmentId);
  const endTimeSec =
    sortie?.segments.at(-1)?.endTimeSec ??
    (sortie === undefined
      ? missionTimeSec
      : sortie.plannedLaunchTimeSec + sortie.totalDurationSec);
  const remainingRatio = Math.max(
    0,
    Math.min(1, 1 - (missionTimeSec - endTimeSec) / LANDED_DURATION_SEC)
  );
  return Math.round(255 * remainingRatio);
}
