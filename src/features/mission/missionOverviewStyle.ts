import type {
  CaseBundleV2,
  MapPoint,
  SegmentType,
  TimedMapPoint
} from "../cases/caseBundle";

/**
 * 全局总览配色（后端 global_overview_SP-*.png 语义）。
 *
 * 与后端 visualize_global_overview 逐行对齐：
 * - 所有条带只画中性灰色细虚线背景（不按无人机分色）；
 * - 覆盖航迹只画 COVERAGE_LINE + TURN 两类段（后端其他段不落绘图分支），
 *   按后端 tab10 色板给每条覆盖航线一个颜色；覆盖线实线、转弯点线；
 * - 每架在入口/出口补 ○/□ 标记 + 入口旁 `CR-xxx [起..止] 距离km` 标签。
 */

export const STRIP_NEUTRAL_HEX = "#AAAAAA";

/** 后端 tab10 色板 _COLORS（按 coverage_routes 顺序，即 bundle.sorties 顺序）。 */
export const TAB10_COLORS: readonly string[] = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
];

/** 后端 alpha：覆盖线 0.85、转弯 0.55，映射到 deck 0-255。 */
export const COVERAGE_LINE_ALPHA = Math.round(0.85 * 255);
export const TURN_ALPHA = Math.round(0.55 * 255);

const OVERVIEW_SEGMENT_TYPES: ReadonlySet<SegmentType> = new Set([
  "COVERAGE_LINE",
  "TURN"
]);

/** 后端 global_overview 只画这两类段；其余（TAKEOFF/ENTRY/TRANSITION/RETURN 等）不出现。 */
export function isOverviewSegment(segmentType: SegmentType): boolean {
  return OVERVIEW_SEGMENT_TYPES.has(segmentType);
}

/** 转弯用点线、覆盖线用实线，后端以 linestyle 区分。 */
export function isTaperedSegment(segmentType: SegmentType): boolean {
  return segmentType === "TURN";
}

/**
 * 后端_color 按 coverage_routes 列表顺序（== bundle.sorties 顺序）取 tab10。
 * 我们用 assignmentId 在 sorties 中的下标确定该航线颜色，与 png 同色。
 */
export function overviewRouteColor(
  bundle: CaseBundleV2,
  assignmentId: string
): string {
  const index = bundle.sorties.findIndex(
    sortie => sortie.assignmentId === assignmentId
  );
  const position = index < 0 ? 0 : index;
  return TAB10_COLORS[position % TAB10_COLORS.length] ?? TAB10_COLORS[0];
}

export interface OverviewSegmentDatum {
  assignmentId: string;
  uavId: string;
  segmentType: SegmentType;
  timedPath: TimedMapPoint[];
}

const flattenCache = new WeakMap<
  CaseBundleV2,
  readonly OverviewSegmentDatum[]
>();

/**
 * 展平每条 sortie 的覆盖段（只保留 COVERAGE_LINE + TURN，供「后端总览」）。
 *
 * 后端 visualize_global_overview 只画覆盖线与转弯两类段，场外进出基地段一律
 * 不画（无绘图分支）。这里据此过滤。createMissionDeckLayers 每帧重建图层，
 * 用 WeakMap 缓存保证跨帧 data 引用稳定，避免 deck.gl 每帧重新 tessellation。
 * 单点段（timedPath.length < 2）是 PathLayer 退化实例且与前后段共享顶点，丢弃零损失。
 */
export function flattenSortieSegments(
  bundle: CaseBundleV2
): readonly OverviewSegmentDatum[] {
  let data = flattenCache.get(bundle);
  if (data === undefined) {
    data = bundle.sorties.flatMap(sortie =>
      sortie.segments
        .filter(segment =>
          segment.timedPath.length >= 2 &&
          isOverviewSegment(segment.segmentType)
        )
        .map(segment => ({
          assignmentId: sortie.assignmentId,
          uavId: sortie.uavId,
          segmentType: segment.segmentType,
          timedPath: segment.timedPath
        }))
    );
    flattenCache.set(bundle, data);
  }
  return data;
}

export interface OverviewEntryExit {
  assignmentId: string;
  uavId: string;
  routeId: string;
  distanceKm: number;
  entry: MapPoint;
  exit: MapPoint;
  stripStartIndex: number;
  stripEndIndex: number;
}

/**
 * 派生每条覆盖航线的入口/出口、条带区间与标签字段（对齐后端 coverage_route）。
 *
 * 入口 = 首条 COVERAGE_LINE 段 mapPath 起点；出口 = 末条 COVERAGE_LINE 段
 * mapPath 末点（数值上等价于后端 coverage_route.entry_point/exit_point）。
 * routeId = 后端 coverage_route_id（CR-{assignmentId}）；distanceKm 取 sortie
 * 总距离（后端 total_distance_m / 1000）。
 */
export function deriveEntryExit(bundle: CaseBundleV2): OverviewEntryExit[] {
  const assignmentBySortie = new Map(
    bundle.assignments.map(assignment => [
      assignment.assignmentId,
      assignment
    ])
  );
  const result: OverviewEntryExit[] = [];

  for (const sortie of bundle.sorties) {
    let firstCoverage: (typeof sortie.segments)[number] | undefined;
    let lastCoverage: (typeof sortie.segments)[number] | undefined;
    for (const segment of sortie.segments) {
      if (segment.segmentType !== "COVERAGE_LINE") continue;
      if (firstCoverage === undefined) firstCoverage = segment;
      lastCoverage = segment;
    }
    if (firstCoverage === undefined || lastCoverage === undefined) continue;

    const assignment = assignmentBySortie.get(sortie.assignmentId);
    const firstPoints = firstCoverage.mapPath;
    const lastPoints = lastCoverage.mapPath;
    const entry = firstPoints[0];
    const exit = lastPoints.at(-1);
    if (entry === undefined || exit === undefined) continue;

    result.push({
      assignmentId: sortie.assignmentId,
      uavId: sortie.uavId,
      routeId: `CR-${sortie.assignmentId}`,
      distanceKm: sortie.totalDistanceM / 1000,
      entry,
      exit,
      stripStartIndex: assignment?.stripStartIndex ?? 0,
      stripEndIndex: assignment?.stripEndIndex ?? 0
    });
  }

  return result;
}
