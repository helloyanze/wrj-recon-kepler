import {describe, expect, it} from "vitest";
import {parseMissionPlan} from "../../src/features/cases/missionPlanSchema";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";

describe("algorithm mission plan schema", () => {
  it("accepts the R10 fixture and exposes assignment and segment values", () => {
    const parsed = parseMissionPlan(missionPlanFixture, "nested/mission_plan.json");

    expect(parsed.assignmentPlan.assignments[0]).toMatchObject({
      assignmentId: "ASG-0001-001",
      uavId: "UAV-04",
      baseId: "BASE-01",
      flightCandidateId: "FPC-00560",
      stripStartIndex: 0,
      stripEndIndex: 0,
      stripIds: ["ST-0001"],
      entryVariant: "START",
      plannedLaunchTimeSec: 0,
      batchIndex: 0,
      routeEstimateId: "RTE-0001",
      coverageRouteId: null
    });
    expect(
      parsed.trajectories[0].segments.map(
        ({segmentId, segmentType, stripId, heightM, speedMps, durationSec}) => ({
          segmentId,
          segmentType,
          stripId,
          heightM,
          speedMps,
          durationSec
        })
      )
    ).toEqual([
      {
        segmentId: "SEG-0001",
        segmentType: "CLIMB",
        stripId: null,
        heightM: 120,
        speedMps: 25,
        durationSec: 10
      },
      {
        segmentId: "SEG-0002",
        segmentType: "COVERAGE_LINE",
        stripId: "ST-0001",
        heightM: 120,
        speedMps: 20,
        durationSec: 20
      },
      {
        segmentId: "SEG-0003",
        segmentType: "DESCENT",
        stripId: null,
        heightM: 120,
        speedMps: 25,
        durationSec: 22
      }
    ]);
    expect(parsed.trajectories[0].segments[1].geometry.coordinates).toEqual([
      [100, 200],
      [500, 200]
    ]);
  });

  it("reports the source and field path for a non-finite launch time", () => {
    const invalid = structuredClone(missionPlanFixture);
    invalid.assignmentPlan.assignments[0].plannedLaunchTimeSec = Number.NaN;

    expect(() => parseMissionPlan(invalid, "nested/mission_plan.json")).toThrow(
      /nested\/mission_plan\.json.*plannedLaunchTimeSec/s
    );
  });

  it("rejects an infeasible plan", () => {
    const invalid = {...missionPlanFixture, feasible: false};

    expect(() => parseMissionPlan(invalid, "mission_plan.json")).toThrow(/feasible/);
  });

  it("rejects an invalid validation report", () => {
    const invalid = structuredClone(missionPlanFixture);
    invalid.validationReport.valid = false;

    expect(() => parseMissionPlan(invalid, "mission_plan.json")).toThrow(
      /validationReport\.valid/
    );
  });

  it.each([
    {
      label: "assignments",
      path: "assignmentPlan.assignments",
      mutate: (value: typeof missionPlanFixture) => {
        value.assignmentPlan.assignments = [];
      }
    },
    {
      label: "trajectories",
      path: "trajectories",
      mutate: (value: typeof missionPlanFixture) => {
        value.trajectories = [];
      }
    },
    {
      label: "strips",
      path: "assignmentPlan.stripPlanSnapshot.strips",
      mutate: (value: typeof missionPlanFixture) => {
        value.assignmentPlan.stripPlanSnapshot.strips = [];
      }
    }
  ])("rejects empty $label with a meaningful field path", ({path, mutate}) => {
    const invalid = structuredClone(missionPlanFixture);
    mutate(invalid);

    expect(() => parseMissionPlan(invalid, "mission_plan.json")).toThrow(path);
  });

  it.each([
    {
      label: "coordinate",
      path: "trajectories.0.segments.0.geometry.coordinates.0.0",
      mutate: (value: typeof missionPlanFixture) => {
        value.trajectories[0].segments[0].geometry.coordinates[0][0] = Number.POSITIVE_INFINITY;
      }
    },
    {
      label: "duration",
      path: "trajectories.0.segments.0.durationSec",
      mutate: (value: typeof missionPlanFixture) => {
        value.trajectories[0].segments[0].durationSec = Number.NaN;
      }
    },
    {
      label: "height",
      path: "trajectories.0.segments.0.heightM",
      mutate: (value: typeof missionPlanFixture) => {
        value.trajectories[0].segments[0].heightM = Number.NEGATIVE_INFINITY;
      }
    },
    {
      label: "speed",
      path: "trajectories.0.segments.0.speedMps",
      mutate: (value: typeof missionPlanFixture) => {
        value.trajectories[0].segments[0].speedMps = Number.POSITIVE_INFINITY;
      }
    }
  ])("rejects a non-finite nested $label", ({path, mutate}) => {
    const invalid = structuredClone(missionPlanFixture);
    mutate(invalid);

    expect(() => parseMissionPlan(invalid, "mission_plan.json")).toThrow(path);
  });

  it("accepts and preserves unknown properties throughout the object graph", () => {
    const extended = structuredClone(missionPlanFixture);
    Object.assign(extended, {futureTopLevel: "top"});
    Object.assign(extended.assignmentPlan, {futureAssignmentPlan: "plan"});
    Object.assign(extended.assignmentPlan.assignments[0], {futureAssignment: "assignment"});
    Object.assign(extended.assignmentPlan.stripPlanSnapshot, {futureSnapshot: "snapshot"});
    Object.assign(extended.assignmentPlan.stripPlanSnapshot.strips[0], {futureStrip: "strip"});
    Object.assign(extended.assignmentPlan.stripPlanSnapshot.strips[0].start, {
      futurePoint: "strip-point"
    });
    Object.assign(extended.assignmentPlan.stripPlanSnapshot.strips[0].coveragePolygon[0], {
      futurePoint: "polygon-point"
    });
    Object.assign(extended.trajectories[0], {futureTrajectory: "trajectory"});
    Object.assign(extended.trajectories[0].segments[0], {futureSegment: "segment"});
    Object.assign(extended.trajectories[0].segments[0].geometry, {
      futureGeometry: "geometry"
    });
    Object.assign(extended.trajectories[0].segments[0].startPoint, {
      futurePoint: "segment-point"
    });
    Object.assign(extended.validationReport, {futureValidation: "validation"});
    Object.assign(extended.finalScore, {futureScore: "score"});

    const parsed = parseMissionPlan(extended, "mission_plan.json");

    expect(parsed.futureTopLevel).toBe("top");
    expect(parsed.assignmentPlan.futureAssignmentPlan).toBe("plan");
    expect(parsed.assignmentPlan.assignments[0].futureAssignment).toBe("assignment");
    expect(parsed.assignmentPlan.stripPlanSnapshot.futureSnapshot).toBe("snapshot");
    expect(parsed.assignmentPlan.stripPlanSnapshot.strips[0].futureStrip).toBe("strip");
    expect(parsed.assignmentPlan.stripPlanSnapshot.strips[0].start.futurePoint).toBe(
      "strip-point"
    );
    expect(
      parsed.assignmentPlan.stripPlanSnapshot.strips[0].coveragePolygon[0].futurePoint
    ).toBe("polygon-point");
    expect(parsed.trajectories[0].futureTrajectory).toBe("trajectory");
    expect(parsed.trajectories[0].segments[0].futureSegment).toBe("segment");
    expect(parsed.trajectories[0].segments[0].geometry.futureGeometry).toBe("geometry");
    expect(parsed.trajectories[0].segments[0].startPoint.futurePoint).toBe("segment-point");
    expect(parsed.validationReport.futureValidation).toBe("validation");
    expect(parsed.finalScore.futureScore).toBe("score");
  });
});
