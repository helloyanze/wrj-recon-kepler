import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "../../src/features/cases/caseBundle";
import {
  COVERAGE_LINE_ALPHA,
  TURN_ALPHA,
  TAB10_COLORS,
  deriveEntryExit,
  flattenSortieSegments,
  isOverviewSegment,
  isTaperedSegment,
  overviewRouteColor
} from "../../src/features/mission/missionOverviewStyle";

const bundle: CaseBundleV2 = caseBundleSchema.parse(
  JSON.parse(readFileSync(join(
    process.cwd(),
    "public",
    "data",
    "integration-cases",
    "R01-BASELINE-01",
    "bundle.json"
  ), "utf8"))
);

describe("overview segment classification", () => {
  it("keeps only coverage and turn segments in an overview", () => {
    for (const type of ["COVERAGE_LINE", "TURN"] as const) {
      expect(isOverviewSegment(type)).toBe(true);
    }
    for (const type of [
      "TAKEOFF",
      "CLIMB",
      "ENTRY",
      "TRANSITION",
      "RETURN",
      "DESCENT",
      "LANDING"
    ] as const) {
      expect(isOverviewSegment(type)).toBe(false);
    }
  });

  it("marks only turns as tapered dotted lines", () => {
    expect(isTaperedSegment("COVERAGE_LINE")).toBe(false);
    expect(isTaperedSegment("TURN")).toBe(true);
  });

  it("maps emphasis alpha to the backend opacities", () => {
    expect(COVERAGE_LINE_ALPHA).toBe(Math.round(0.85 * 255));
    expect(TURN_ALPHA).toBe(Math.round(0.55 * 255));
  });
});

describe("flattenSortieSegments", () => {
  const flat = flattenSortieSegments(bundle);

  it("returns one joined path per UAV across all sorties", () => {
    const uavIds = [...new Set(bundle.sorties.map(sortie => sortie.uavId))];
    expect(flat).toHaveLength(uavIds.length);
    uavIds.forEach((uavId, index) => {
      const sorties = bundle.sorties.filter(sortie => sortie.uavId === uavId);
      expect(flat[index]).toMatchObject({
        uavId,
        segmentType: "COVERAGE_LINE"
      });
      expect(flat[index].assignmentId).toBe(
        [...sorties].sort((left, right) => (
          left.plannedLaunchTimeSec - right.plannedLaunchTimeSec ||
          left.batchIndex - right.batchIndex ||
          left.assignmentId.localeCompare(right.assignmentId)
        ))[0].assignmentId
      );
    });
  });

  it("keeps transit and vertical-connector points instead of only coverage/turn", () => {
    for (const sortie of bundle.sorties) {
      const coverageOnly = sortie.segments
        .filter(segment =>
          segment.timedPath.length >= 2 &&
          isOverviewSegment(segment.segmentType)
        )
        .reduce((sum, segment) => sum + segment.timedPath.length, 0);
      const joined = flat.find(item => item.uavId === sortie.uavId);
      expect(joined).toBeDefined();
      expect(joined!.timedPath.length).toBeGreaterThanOrEqual(sortie.trip.length);
      expect(joined!.timedPath.length).toBeGreaterThanOrEqual(coverageOnly);
    }
  });

  it("caches the joined result across calls", () => {
    expect(flattenSortieSegments(bundle)).toBe(flat);
  });
});

describe("overviewRouteColor", () => {
  it("assigns tab10 colors in sortie order for the baseline two-UAV case", () => {
    expect(TAB10_COLORS).toContain("#1f77b4");
    expect(TAB10_COLORS).toContain("#ff7f0e");
    expect(overviewRouteColor(bundle, bundle.sorties[0].assignmentId))
      .toBe("#1f77b4");
    expect(overviewRouteColor(bundle, bundle.sorties[1].assignmentId))
      .toBe("#ff7f0e");
  });

  it("falls back to the first tab10 color for an unknown assignment", () => {
    expect(overviewRouteColor(bundle, "NO-SUCH-ASSIGNMENT"))
      .toBe("#1f77b4");
  });
});

describe("deriveEntryExit", () => {
  const markers = deriveEntryExit(bundle);

  it("returns one marker per coverage sortie", () => {
    const coverageSorties = bundle.sorties.filter(sortie =>
      sortie.segments.some(segment => segment.segmentType === "COVERAGE_LINE")
    );
    expect(markers).toHaveLength(coverageSorties.length);
    expect(markers.map(({assignmentId}) => assignmentId))
      .toEqual(coverageSorties.map(({assignmentId}) => assignmentId));
  });

  it("anchors entry/exit at first/last coverage segment endpoints", () => {
    for (const sortie of bundle.sorties) {
      const coverage = sortie.segments.filter(
        segment => segment.segmentType === "COVERAGE_LINE"
      );
      if (coverage.length === 0) continue;
      const marker = markers.find(
        item => item.assignmentId === sortie.assignmentId
      );
      expect(marker).toBeDefined();
      expect([marker!.entry[0], marker!.entry[1]]).toEqual([
        coverage[0].mapPath[0][0],
        coverage[0].mapPath[0][1]
      ]);
      const last = coverage.at(-1)!;
      expect([marker!.exit[0], marker!.exit[1]]).toEqual([
        last.mapPath.at(-1)![0],
        last.mapPath.at(-1)![1]
      ]);
    }
  });

  it("carries the route id, strip range and km for the entry label", () => {
    const byAssignment = new Map(
      bundle.assignments.map(assignment => [
        assignment.assignmentId,
        assignment
      ])
    );
    for (const marker of markers) {
      const assignment = byAssignment.get(marker.assignmentId);
      expect(marker.routeId).toBe(`CR-${marker.assignmentId}`);
      expect(marker.stripStartIndex).toBe(assignment?.stripStartIndex);
      expect(marker.stripEndIndex).toBe(assignment?.stripEndIndex);
      // 后端标签: {routeId}  [{start}..{end}]  {km} km
      const label = `${marker.routeId}  [${marker.stripStartIndex}..${marker.stripEndIndex}]  ${marker.distanceKm.toFixed(1)} km`;
      expect(label).toMatch(/km$/);
    }
  });
});
