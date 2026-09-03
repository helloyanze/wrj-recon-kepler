import {PathStyleExtension} from "@deck.gl/extensions";
import {TripsLayer} from "@deck.gl/geo-layers";
import {
  IconLayer,
  PathLayer,
  PolygonLayer,
  TextLayer
} from "@deck.gl/layers";
import type {
  CaseBundleV2,
  MapPoint,
  NormalizedSortie
} from "../cases/caseBundle";
import {
  selectSortieStates,
  type LiveSortieState
} from "./missionInterpolation";
import {
  selectScannedCoverage,
  type ScannedCoverageDatum
} from "./missionScanCoverage";
import type {
  MissionLayerPreferencesV3,
  VerticalScale
} from "./missionLayerPreferences";
import {
  COVERAGE_LINE_ALPHA,
  STRIP_NEUTRAL_HEX,
  TURN_ALPHA,
  deriveEntryExit,
  flattenSortieSegments,
  isTaperedSegment,
  overviewRouteColor,
  type OverviewSegmentDatum
} from "./missionOverviewStyle";

export interface MissionDeckLayerOptions {
  bundle: CaseBundleV2;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV3;
  onSelectSortie?: (assignmentId: string) => void;
}

type DeckColor = [red: number, green: number, blue: number, alpha: number];

interface RegionDatum {
  polygon: CaseBundleV2["region"]["polygon"];
}

type StripDatum = CaseBundleV2["strips"][number];

type RouteDatum = NormalizedSortie | OverviewSegmentDatum;

interface OverviewMarkerDatum {
  key: string;
  text: string;
  position: [longitude: number, latitude: number, altitudeM: number];
  color: DeckColor;
  size: number;
  pixelOffset: [number, number];
}

interface MarkerDatum extends LiveSortieState {
  position: readonly [longitude: number, latitude: number, altitudeM: number];
  color: DeckColor;
}

const REGION_FILL_COLOR: DeckColor = [53, 197, 255, 255];
const REGION_LINE_COLOR: DeckColor = [104, 220, 255, 255];
const FALLBACK_UAV_COLOR = "#FFFFFF";
const LANDED_DURATION_SEC = 3;

// 后端总览线型：条带灰色细虚线、覆盖线实线、转弯点线（deck 虚线单位 = 像素，
// 与 widthUnits:"pixels" 一致）。PathStyleExtension 单例跨层复用。
const STRIP_DASH: [number, number] = [3, 4];
const COVERAGE_DASH: [number, number] = [0, 0]; // 0 => 实线
const TURN_DASH: [number, number] = [1, 4]; // 点线（linestyle ":"）
const stripDashStyle = new PathStyleExtension({dash: true});
const routeDashStyle = new PathStyleExtension({dash: true});

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
  const scannedPreference = preferences.layers.scanned;
  const routePreference = preferences.layers.routes;
  const tripPreference = preferences.layers.trips;
  const colorFrom = (
    colors: Readonly<Record<string, string>>,
    id: string,
    alpha = 255
  ): DeckColor => hexToRgba(colors[id] ?? FALLBACK_UAV_COLOR, alpha);
  const isOverview = (preferences.colorMode ?? "uav") === "overview";
  const stripColorKey = colorMapKey(preferences.stripColors);
  const scannedColorKey = colorMapKey(preferences.layerUavColors.scanned);
  const routeColorKey = colorMapKey(preferences.layerUavColors.routes);
  const tripColorKey = colorMapKey(preferences.layerUavColors.trips);
  const markerColorKey = colorMapKey(preferences.layerUavColors.markers);
  const routePath = (datum: RouteDatum) => "timedPath" in datum
    ? datum.timedPath
    : datum.trip;
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

    const color = colorFrom(preferences.layerUavColors.markers, state.uavId);
    const alpha = state.status === "landed"
      ? landedAlpha(bundle.sorties, state.assignmentId, missionTimeSec)
      : 255;
    return [{
      ...state,
      position: scalePoint(state.position, verticalScale),
      color: [color[0], color[1], color[2], alpha]
    }];
  });
  const scannedCoverage = selectScannedCoverage(bundle, missionTimeSec);

  // 全局总览（后端 global_overview）：每架入口 ○ / 出口 □ + 入口旁 CR-xxx [起..止] 距离km 标签。
  const overviewMarkers: OverviewMarkerDatum[] = [];
  if (isOverview) {
    const glyphSize = Math.max(16, Math.round((preferences.markerSize ?? 30) * 0.75));
    for (const info of deriveEntryExit(bundle)) {
      const color = hexToRgba(overviewRouteColor(bundle, info.assignmentId));
      const entry = [info.entry[0], info.entry[1], info.entry[2]] as const;
      const exit = [info.exit[0], info.exit[1], info.exit[2]] as const;
      const label = `${info.routeId}  [${info.stripStartIndex}..${info.stripEndIndex}]  ${info.distanceKm.toFixed(1)} km`;
      overviewMarkers.push(
        {
          key: `${info.assignmentId}:entry`,
          text: "○",
          position: [entry[0], entry[1], entry[2]],
          color,
          size: glyphSize,
          pixelOffset: [0, 0]
        },
        {
          key: `${info.assignmentId}:exit`,
          text: "□",
          position: [exit[0], exit[1], exit[2]],
          color,
          size: glyphSize,
          pixelOffset: [0, 0]
        },
        {
          key: `${info.assignmentId}:label`,
          text: label,
          position: [entry[0], entry[1], entry[2]],
          color,
          size: 12,
          pixelOffset: [10, 10]
        }
      );
    }
  }

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
    new PolygonLayer<ScannedCoverageDatum>({
      id: "wrj-algorithm-scanned",
      data: scannedCoverage,
      visible: scannedPreference.visible,
      opacity: scannedPreference.opacity,
      pickable: true,
      filled: true,
      stroked: false,
      getPolygon: ({polygon}) => polygon.map(seaLevelPoint),
      getFillColor: ({uavId}) =>
        colorFrom(preferences.layerUavColors.scanned, uavId),
      updateTriggers: {getFillColor: scannedColorKey},
      ...selectable<ScannedCoverageDatum>()
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
      getColor: isOverview
        ? () => hexToRgba(STRIP_NEUTRAL_HEX)
        : ({stripId}) => colorFrom(preferences.stripColors, stripId),
      updateTriggers: {getColor: isOverview ? "overview" : stripColorKey},
      ...(isOverview
        ? {
            // 后端条带为灰色细虚线背景（ls="--"）。
            extensions: [stripDashStyle],
            getDashArray: () => STRIP_DASH
          }
        : {}),
      ...selectable<StripDatum>()
    }),
    new PathLayer<RouteDatum>({
      id: "wrj-algorithm-routes",
      data: isOverview ? flattenSortieSegments(bundle) : bundle.sorties,
      visible: routePreference.visible,
      opacity: routePreference.opacity,
      pickable: true,
      widthUnits: "pixels",
      getWidth: routePreference.width ?? 2,
      getPath: datum => routePath(datum).map(point =>
        scalePoint(point, verticalScale)
      ),
      getColor: datum => {
        if (!isOverview) {
          return colorFrom(preferences.layerUavColors.routes, datum.uavId);
        }
        const segment = datum as OverviewSegmentDatum;
        return hexToRgba(
          overviewRouteColor(bundle, segment.assignmentId),
          isTaperedSegment(segment.segmentType) ? TURN_ALPHA : COVERAGE_LINE_ALPHA
        );
      },
      updateTriggers: {getColor: isOverview ? "overview-tab10" : routeColorKey},
      ...(isOverview
        ? {
            // 转弯点线、覆盖线实线（后端 linestyle ":" vs 实线）。
            extensions: [routeDashStyle],
            getDashArray: (datum: RouteDatum) => (
              isOverview &&
              "segmentType" in datum &&
              isTaperedSegment(datum.segmentType)
            ) ? TURN_DASH : COVERAGE_DASH,
            updateTriggers: {getDashArray: "overview-dash"}
          }
        : {}),
      ...selectable<RouteDatum>()
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
      getColor: ({uavId}) => colorFrom(preferences.layerUavColors.trips, uavId),
      updateTriggers: {getColor: tripColorKey},
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
      updateTriggers: {getColor: markerColorKey},
      getSize: () => preferences.markerSize,
      getIcon: () => UAV_ICON,
      ...selectable<MarkerDatum>()
    }),
    ...(isOverview && overviewMarkers.length > 0
      ? [new TextLayer<OverviewMarkerDatum>({
          id: "wrj-algorithm-overview-markers",
          data: overviewMarkers,
          visible: routePreference.visible,
          opacity: 1,
          pickable: false,
          sizeUnits: "pixels",
          characterSet: "auto",
          fontFamily: "Arial, 'Segoe UI Symbol', 'Microsoft YaHei', sans-serif",
          fontWeight: "bold",
          getPosition: ({position}) => [position[0], position[1]],
          getText: ({text}) => text,
          getColor: ({color}) => color,
          getSize: ({size}) => size,
          getPixelOffset: ({pixelOffset}) => pixelOffset,
          updateTriggers: {getColor: routeColorKey}
        })]
      : [])
  ];
}

function colorMapKey(colors: Readonly<Record<string, string>>): string {
  return Object.entries(colors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, color]) => `${id}:${color}`)
    .join("|");
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

function hexToRgba(hex: string, alpha = 255): DeckColor {
  const value = /^#[0-9A-F]{6}$/i.test(hex)
    ? hex.slice(1)
    : FALLBACK_UAV_COLOR.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha
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
