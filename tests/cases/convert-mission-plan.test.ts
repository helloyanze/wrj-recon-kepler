import {describe, expect, it} from "vitest";
import type {LocalPoint} from "../../src/features/cases/caseBundle";
import {convertMissionPlan} from "../../src/features/cases/convertMissionPlan";
import {localToMapPoint} from "../../src/features/cases/displayTransform";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";

type TestPlan = typeof missionPlanFixture;

const provenance = {
  sourceName: "run-output",
  sourceRun: "R10",
  importedAt: "2026-07-24T10:00:00.000Z",
  sha256: "abc123"
} as const;

function makePlan(): TestPlan {
  return structuredClone(missionPlanFixture);
}

function convert(
  missionPlan: unknown,
  regionProfile?: unknown | null
) {
  return convertMissionPlan({
    missionPlan,
    regionProfile,
    ...provenance
  });
}

function addStrip(plan: TestPlan, stripId: string) {
  const strip = structuredClone(plan.assignmentPlan.stripPlanSnapshot.strips[0]);
  const index =
    Math.max(
      ...plan.assignmentPlan.stripPlanSnapshot.strips.map(value => value.index)
    ) + 1;
  strip.stripId = stripId;
  strip.index = index;
  strip.start.yM += 300 * index;
  strip.end.yM += 300 * index;
  strip.coveragePolygon.forEach(point => {
    point.yM += 300 * index;
  });
  plan.assignmentPlan.stripPlanSnapshot.strips.push(strip);
  plan.assignmentPlan.stripPlanSnapshot.stripCount =
    plan.assignmentPlan.stripPlanSnapshot.strips.length;
  return strip;
}

function addSecondStrip(plan: TestPlan) {
  return addStrip(plan, "ST-0002");
}

function addSecondSortie(
  plan: TestPlan,
  {
    assignmentId = "ASG-0001-002",
    uavId = "UAV-04",
    launchTimeSec = 1206.801,
    batchIndex = 1,
    stripId = "ST-0002"
  }: {
    assignmentId?: string;
    uavId?: string;
    launchTimeSec?: number;
    batchIndex?: number;
    stripId?: string;
  } = {}
) {
  if (!plan.assignmentPlan.stripPlanSnapshot.strips.some(
    strip => strip.stripId === stripId
  )) {
    addStrip(plan, stripId);
  }

  const assignment = structuredClone(plan.assignmentPlan.assignments[0]);
  assignment.assignmentId = assignmentId;
  assignment.uavId = uavId;
  assignment.stripStartIndex =
    plan.assignmentPlan.stripPlanSnapshot.strips.find(
      strip => strip.stripId === stripId
    )?.index ?? 0;
  assignment.stripEndIndex = assignment.stripStartIndex;
  assignment.stripIds = [stripId];
  assignment.plannedLaunchTimeSec = launchTimeSec;
  assignment.batchIndex = batchIndex;
  assignment.routeEstimateId = `RTE-${assignmentId}`;
  plan.assignmentPlan.assignments.push(assignment);

  const trajectory = structuredClone(plan.trajectories[0]);
  trajectory.trajectoryId = `TRJ-${assignmentId}`;
  trajectory.assignmentId = assignmentId;
  trajectory.uavId = uavId;
  trajectory.segments.forEach((segment, index) => {
    segment.segmentId = `SEG-${assignmentId}-${index + 1}`;
    segment.geometry.coordinates.forEach(coordinate => {
      coordinate[1] += 300;
    });
    segment.startPoint.yM += 300;
    segment.endPoint.yM += 300;
    if (segment.stripId !== null) {
      segment.stripId = stripId;
    }
  });
  plan.trajectories.push(trajectory);

  plan.missionMakespanSec = launchTimeSec + trajectory.totalDurationSec;
  plan.totalDistanceM += trajectory.totalDistanceM;
  if (plan.totalFuelKg !== null && trajectory.totalFuelKg !== null) {
    plan.totalFuelKg += trajectory.totalFuelKg;
  }
  return {assignment, trajectory};
}

describe("convertMissionPlan", () => {
  it("converts one assignment into a deterministic version-2 case bundle without mutation", () => {
    const plan = makePlan();
    const before = structuredClone(plan);

    const bundle = convert(plan);

    expect(bundle.version).toBe(2);
    expect(bundle.case).toEqual({
      caseId: "CASE-0001",
      planId: "PLAN-0001",
      displayName: "CASE-0001"
    });
    expect(bundle.assignments).toEqual([
      {
        assignmentId: "ASG-0001-001",
        uavId: "UAV-04",
        baseId: "BASE-01",
        flightCandidateId: "FPC-00560",
        stripIds: ["ST-0001"],
        stripStartIndex: 0,
        stripEndIndex: 0,
        batchIndex: 0,
        plannedLaunchTimeSec: 0
      }
    ]);
    expect(bundle.sorties).toHaveLength(1);
    expect(bundle.sorties[0]).toMatchObject({
      trajectoryId: "TRJ-0001",
      assignmentId: "ASG-0001-001",
      uavId: "UAV-04",
      batchIndex: 0,
      plannedLaunchTimeSec: 0,
      stripIds: ["ST-0001"],
      totalDistanceM: 1200,
      totalDurationSec: 52,
      totalFuelKg: 2.25
    });
    expect(bundle.sorties[0].segments).toHaveLength(3);
    expect(bundle.sorties[0].segments.map(segment => [
      segment.startTimeSec,
      segment.endTimeSec
    ])).toEqual([
      [0, 10],
      [10, 30],
      [30, 52]
    ]);
    expect(bundle.sorties[0].trip[0][3]).toBe(0);
    expect(bundle.sorties[0].trip.at(-1)?.[3]).toBe(52);
    expect(bundle.strips).toHaveLength(1);
    expect(bundle.strips[0]).toMatchObject({
      stripId: "ST-0001",
      index: 0,
      uavId: "UAV-04",
      assignmentId: "ASG-0001-001"
    });
    expect(bundle.strips[0].line.every(point => point[2] === 0)).toBe(true);
    expect(bundle.strips[0].polygon.every(point => point[2] === 0)).toBe(true);
    expect(bundle.region.source).toBe("DERIVED_FROM_STRIPS");
    expect(bundle.region.polygon[0]).toEqual(bundle.region.polygon.at(-1));
    expect(bundle.metrics).toEqual({
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      coverageRatio: 0.98,
      missionMakespanSec: 52,
      totalDistanceM: 1200,
      totalFuelKg: 2.25
    });
    expect(bundle.validation).toEqual({
      valid: true,
      warnings: [],
      failureCodes: []
    });
    expect(bundle.displayTransform).toEqual({
      anchorLongitude: 110.235,
      anchorLatitude: 18.625,
      sourceCenterXM: 250,
      sourceCenterYM: 125,
      xAxis: "EAST",
      yAxis: "NORTH"
    });
    expect(bundle.provenance).toEqual(provenance);
    expect(plan).toEqual(before);
    expect(bundle.assignments[0].stripIds).not.toBe(
      plan.assignmentPlan.assignments[0].stripIds
    );
    expect(bundle.sorties[0].segments[0].localPath[0]).not.toBe(
      plan.trajectories[0].segments[0].geometry.coordinates[0]
    );
    expect(bundle.strips[0].line[0]).not.toBe(
      plan.assignmentPlan.stripPlanSnapshot.strips[0].start
    );
  });

  it("sorts two same-UAV sorties and reports normalized physical counts", () => {
    const plan = makePlan();
    const second = addSecondSortie(plan);
    Object.assign(plan.assignmentPlan, {
      usedUavCount: 1,
      batchCount: 2,
      stripCount: 2
    });
    plan.assignmentPlan.assignments.reverse();
    plan.trajectories.reverse();

    const bundle = convert(plan);

    expect(bundle.assignments.map(assignment => assignment.assignmentId)).toEqual([
      "ASG-0001-001",
      "ASG-0001-002"
    ]);
    expect(bundle.sorties.map(sortie => [
      sortie.assignmentId,
      sortie.plannedLaunchTimeSec,
      sortie.batchIndex
    ])).toEqual([
      ["ASG-0001-001", 0, 0],
      ["ASG-0001-002", 1206.801, 1]
    ]);
    expect(bundle.metrics).toMatchObject({
      uavCount: 1,
      sortieCount: 2,
      batchCount: 2,
      stripCount: 2
    });
    expect(bundle.strips.map(strip => [
      strip.stripId,
      strip.uavId,
      strip.assignmentId
    ])).toEqual([
      ["ST-0001", "UAV-04", "ASG-0001-001"],
      ["ST-0002", "UAV-04", second.assignment.assignmentId]
    ]);
  });

  it("sorts assignment ties by launch time, then batch index, then assignment ID", () => {
    const plan = makePlan();
    addSecondSortie(plan, {
      assignmentId: "ASG-Z",
      uavId: "UAV-Z",
      launchTimeSec: 100,
      batchIndex: 2
    });
    addSecondSortie(plan, {
      assignmentId: "ASG-A",
      uavId: "UAV-A",
      launchTimeSec: 100,
      batchIndex: 1,
      stripId: "ST-0003"
    });
    plan.assignmentPlan.assignments[0].plannedLaunchTimeSec = 100;
    plan.assignmentPlan.assignments[0].batchIndex = 1;
    plan.assignmentPlan.assignments.reverse();
    plan.trajectories.reverse();
    plan.missionMakespanSec = 152;

    const bundle = convert(plan);

    expect(bundle.assignments.map(assignment => assignment.assignmentId)).toEqual([
      "ASG-0001-001",
      "ASG-A",
      "ASG-Z"
    ]);
    expect(bundle.sorties.map(sortie => sortie.assignmentId)).toEqual([
      "ASG-0001-001",
      "ASG-A",
      "ASG-Z"
    ]);
  });

  it.each([
    {
      label: "duplicate assignment IDs",
      mutate: (plan: TestPlan) => {
        addSecondSortie(plan, {assignmentId: "ASG-0001-001"});
      },
      expected: /assignment.*ASG-0001-001.*duplicate/i
    },
    {
      label: "a trajectory without an assignment",
      mutate: (plan: TestPlan) => {
        plan.trajectories[0].assignmentId = "ASG-MISSING";
      },
      expected: /trajectory.*TRJ-0001.*ASG-MISSING.*assignment/i
    },
    {
      label: "an assignment without a trajectory",
      mutate: (plan: TestPlan) => {
        const assignment = structuredClone(plan.assignmentPlan.assignments[0]);
        assignment.assignmentId = "ASG-NO-TRAJECTORY";
        plan.assignmentPlan.assignments.push(assignment);
      },
      expected: /assignment.*ASG-NO-TRAJECTORY.*trajectory/i
    },
    {
      label: "more than one trajectory for an assignment",
      mutate: (plan: TestPlan) => {
        const trajectory = structuredClone(plan.trajectories[0]);
        trajectory.trajectoryId = "TRJ-DUPLICATE";
        plan.trajectories.push(trajectory);
      },
      expected: /assignment.*ASG-0001-001.*more than one trajectory|multiple trajectories/i
    },
    {
      label: "duplicate strip ownership",
      mutate: (plan: TestPlan) => {
        addSecondSortie(plan, {
          assignmentId: "ASG-DUPLICATE-OWNER",
          stripId: "ST-0001"
        });
      },
      expected: /strip.*ST-0001.*ASG-0001-001.*ASG-DUPLICATE-OWNER/i
    },
    {
      label: "missing strip ownership",
      mutate: (plan: TestPlan) => {
        addSecondStrip(plan);
      },
      expected: /strip.*ST-0002.*owner|strip.*ST-0002.*assignment/i
    },
    {
      label: "an assignment referencing an unknown strip",
      mutate: (plan: TestPlan) => {
        plan.assignmentPlan.assignments[0].stripIds = ["ST-UNKNOWN"];
      },
      expected: /assignment.*ASG-0001-001.*unknown strip.*ST-UNKNOWN/i
    },
    {
      label: "a trajectory whose UAV differs from its assignment",
      mutate: (plan: TestPlan) => {
        plan.trajectories[0].uavId = "UAV-WRONG";
      },
      expected: /trajectory.*TRJ-0001.*UAV-WRONG.*assignment.*ASG-0001-001.*UAV-04/i
    }
  ])("rejects $label with actionable context", ({mutate, expected}) => {
    const plan = makePlan();
    mutate(plan);

    expect(() => convert(plan)).toThrow(expected);
  });

  it("rejects trajectory.valid=false and identifies the trajectory", () => {
    const plan = makePlan();
    Object.assign(plan.trajectories[0], {valid: false});

    expect(() => convert(plan)).toThrow(/trajectory.*TRJ-0001.*valid.*false/i);
  });

  it("rejects segment.valid=false and identifies the segment and trajectory", () => {
    const plan = makePlan();
    plan.trajectories[0].segments[1].valid = false;

    expect(() => convert(plan)).toThrow(/trajectory.*TRJ-0001.*segment.*SEG-0002.*valid.*false/i);
  });

  it("enforces the normalized final end against makespan with a 1e-3 tolerance", () => {
    const over = makePlan();
    over.missionMakespanSec = 51.9989;
    expect(() => convert(over)).toThrow(
      /assignment.*ASG-0001-001.*end.*52.*missionMakespanSec.*51\.9989/i
    );

    const within = makePlan();
    within.missionMakespanSec = 51.999;
    expect(convert(within).sorties[0].segments.at(-1)?.endTimeSec).toBe(52);
  });

  it("rejects overlapping sorties for one physical UAV with both assignment IDs", () => {
    const plan = makePlan();
    addSecondSortie(plan, {launchTimeSec: 51});
    plan.missionMakespanSec = 103;

    expect(() => convert(plan)).toThrow(
      /UAV-04.*ASG-0001-001.*ASG-0001-002.*overlap/i
    );
  });

  it("allows sorties for one physical UAV to meet at an equal boundary", () => {
    const plan = makePlan();
    addSecondSortie(plan, {launchTimeSec: 52});
    plan.missionMakespanSec = 104;

    expect(convert(plan).sorties.map(sortie => sortie.plannedLaunchTimeSec)).toEqual([
      0,
      52
    ]);
  });

  it("computes one transform from segment endpoints and geometry, strip points, and region points", () => {
    const plan = makePlan();
    plan.trajectories[0].segments[0].startPoint.xM = -900;
    plan.trajectories[0].segments[2].endPoint.yM = -800;
    plan.trajectories[0].segments[1].geometry.coordinates.push([700, 200]);
    plan.assignmentPlan.stripPlanSnapshot.strips[0].start.xM = -1000;
    plan.assignmentPlan.stripPlanSnapshot.strips[0].end.yM = 900;
    plan.assignmentPlan.stripPlanSnapshot.strips[0].coveragePolygon[2].xM = 1100;
    const regionProfile = {
      geometryWkt: "  polygon (( 0 1200, 100 1200, 0 1100, 0 1200 )) "
    };

    const bundle = convert(plan, regionProfile);
    const transform = bundle.displayTransform;

    expect(transform.sourceCenterXM).toBe(50);
    expect(transform.sourceCenterYM).toBe(200);
    expect(bundle.region.source).toBe("REGION_PROFILE");
    expect(bundle.sorties[0].segments[1].mapPath.at(-1)).toEqual(
      localToMapPoint([700, 200, 120], transform)
    );
    expect(bundle.strips[0].line[0]).toEqual(
      localToMapPoint([-1000, 200, 0], transform)
    );
    expect(bundle.strips[0].line[1]).toEqual(
      localToMapPoint([500, 900, 0], transform)
    );
    expect(bundle.strips[0].polygon[2]).toEqual(
      localToMapPoint([1100, 250, 0], transform)
    );
    expect(bundle.region.polygon[0]).toEqual(
      localToMapPoint([0, 1200, 0], transform)
    );
    expect(bundle.strips[0].line.every(point => point[2] === 0)).toBe(true);
    expect(bundle.strips[0].polygon.every(point => point[2] === 0)).toBe(true);
    expect(bundle.region.polygon.every(point => point[2] === 0)).toBe(true);
  });

  it("parses a case- and whitespace-tolerant simple WKT exterior ring and closes it", () => {
    const bundle = convert(makePlan(), {
      geometryWkt: " PoLyGoN (( 0 0, 900 0, 900 800, 0 800 )) "
    });

    expect(bundle.region.source).toBe("REGION_PROFILE");
    expect(bundle.region.polygon).toHaveLength(5);
    expect(bundle.region.polygon[0]).toEqual(bundle.region.polygon.at(-1));
  });

  it.each([
    {label: "missing profile", profile: undefined},
    {label: "null profile", profile: null},
    {label: "non-object profile", profile: "POLYGON((0 0,1 0,0 1))"},
    {label: "missing WKT", profile: {}},
    {label: "malformed WKT", profile: {geometryWkt: "POINT(0 0)"}},
    {
      label: "an unusable collinear polygon",
      profile: {geometryWkt: "POLYGON((0 0, 1 1, 2 2, 0 0))"}
    }
  ])("falls back to a deterministic strip convex hull for $label", ({profile}) => {
    const bundle = convert(makePlan(), profile);
    const transform = bundle.displayTransform;
    const expectedLocalHull: LocalPoint[] = [
      [100, 150, 0],
      [500, 150, 0],
      [500, 250, 0],
      [100, 250, 0],
      [100, 150, 0]
    ];

    expect(bundle.region.source).toBe("DERIVED_FROM_STRIPS");
    expect(bundle.region.polygon).toEqual(
      expectedLocalHull.map(point => localToMapPoint(point, transform))
    );
  });

  it("rejects an unusable fallback hull with the implicated strip ID", () => {
    const plan = makePlan();
    plan.assignmentPlan.stripPlanSnapshot.strips[0].coveragePolygon = [
      {xM: 1, yM: 1},
      {xM: 2, yM: 2},
      {xM: 1, yM: 1}
    ];

    expect(() => convert(plan, {geometryWkt: "invalid"})).toThrow(
      /region.*strip.*ST-0001.*fewer than 3 unique|convex hull.*3 unique/i
    );
  });

  it("copies authoritative metrics and validates optional authoritative counts", () => {
    const plan = makePlan();
    Object.assign(plan.assignmentPlan, {
      usedUavCount: 1,
      batchCount: 1,
      stripCount: 1
    });
    plan.coverageRatio = 0.876;
    plan.missionMakespanSec = 52;
    plan.totalDistanceM = 9876;

    expect(convert(plan).metrics).toEqual({
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      coverageRatio: 0.876,
      missionMakespanSec: 52,
      totalDistanceM: 9876,
      totalFuelKg: 2.25
    });
  });

  it.each([
    {
      field: "usedUavCount",
      patch: {usedUavCount: 2},
      expected: /assignmentPlan\.usedUavCount.*2.*normalized.*1/i
    },
    {
      field: "stripCount",
      patch: {stripCount: 2},
      expected: /assignmentPlan\.stripCount.*2.*normalized.*1/i
    },
    {
      field: "batchCount",
      patch: {batchCount: 2},
      expected: /assignmentPlan\.batchCount.*2.*distinct.*1/i
    }
  ])("rejects inconsistent authoritative $field", ({patch, expected}) => {
    const plan = makePlan();
    Object.assign(plan.assignmentPlan, patch);

    expect(() => convert(plan)).toThrow(expected);
  });

  it("normalizes nullable fuel at segment, sortie, and plan levels with deterministic warnings", () => {
    const plan = makePlan();
    Object.assign(plan.trajectories[0].segments[0], {
      fuelConsumptionKg: null
    });
    Object.assign(plan.trajectories[0], {totalFuelKg: null});
    Object.assign(plan, {totalFuelKg: null});

    const bundle = convert(plan);

    expect(bundle.sorties[0].segments.map(segment => segment.fuelConsumptionKg)).toEqual([
      0,
      1,
      0.75
    ]);
    expect(bundle.sorties[0].totalFuelKg).toBe(1.75);
    expect(bundle.metrics.totalFuelKg).toBe(1.75);
    expect(bundle.validation.warnings).toEqual([
      "FUEL_DERIVED_SEGMENT: trajectory TRJ-0001 segment SEG-0001 fuelConsumptionKg normalized from null to 0",
      "FUEL_DERIVED_SORTIE: trajectory TRJ-0001 totalFuelKg derived from normalized segment fuel",
      "FUEL_DERIVED_PLAN: totalFuelKg derived from normalized sortie fuel"
    ]);
  });

  it("preserves non-null authoritative sortie and plan fuel totals", () => {
    const plan = makePlan();
    plan.trajectories[0].totalFuelKg = 999;
    plan.totalFuelKg = 888;

    const bundle = convert(plan);

    expect(bundle.sorties[0].totalFuelKg).toBe(999);
    expect(bundle.metrics.totalFuelKg).toBe(888);
    expect(bundle.validation.warnings).toEqual([]);
  });

  it("aggregates warnings and unique failure codes without invalidating a warning-only plan", () => {
    const plan = makePlan();
    Object.assign(plan.validationReport, {
      warnings: ["validation warning"],
      failureCodes: ["REPORT", "DUPLICATE"]
    });
    Object.assign(plan.assignmentPlan.stripPlanSnapshot, {
      generationWarnings: ["strip generation warning"]
    });
    Object.assign(plan, {failureCodes: ["TOP", "DUPLICATE"]});

    expect(convert(plan).validation).toEqual({
      valid: true,
      warnings: ["validation warning", "strip generation warning"],
      failureCodes: ["TOP", "DUPLICATE", "REPORT"]
    });
  });

  it.each([
    {
      label: "assignment range does not match its strip ID",
      mutate: (plan: TestPlan) => {
        plan.assignmentPlan.assignments[0].stripStartIndex = 1;
        plan.assignmentPlan.assignments[0].stripEndIndex = 1;
      },
      expected: /assignment.*ASG-0001-001.*range.*1.*strip.*ST-0001.*index.*0/i
    },
    {
      label: "strip snapshot index does not match the assignment range",
      mutate: (plan: TestPlan) => {
        plan.assignmentPlan.stripPlanSnapshot.strips[0].index = 7;
      },
      expected: /assignment.*ASG-0001-001.*range.*0.*strip.*ST-0001.*index.*7/i
    }
  ])("cross-checks strip IDs and index ranges when $label", ({mutate, expected}) => {
    const plan = makePlan();
    mutate(plan);

    expect(() => convert(plan)).toThrow(expected);
  });

  it("emits strips in ascending snapshot index order", () => {
    const plan = makePlan();
    addSecondSortie(plan);
    plan.assignmentPlan.stripPlanSnapshot.strips.reverse();

    expect(convert(plan).strips.map(strip => strip.index)).toEqual([0, 1]);
  });
});
