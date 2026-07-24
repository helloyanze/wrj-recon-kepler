import {describe, expect, it} from "vitest";
import type {
  DisplayTransform,
  TimedMapPoint,
  TimedSegment
} from "../../src/features/cases/caseBundle";
import type {MissionPlan} from "../../src/features/cases/missionPlanSchema";
import {
  buildTrajectoryTimeline,
  buildTripPath
} from "../../src/features/cases/trajectoryTimeline";

type RawTrajectory = MissionPlan["trajectories"][number];
type RawSegment = RawTrajectory["segments"][number];
type RawAssignment = MissionPlan["assignmentPlan"]["assignments"][number];

const transform: DisplayTransform = {
  anchorLongitude: 110.235,
  anchorLatitude: 18.625,
  sourceCenterXM: 0,
  sourceCenterYM: 0,
  xAxis: "EAST",
  yAxis: "NORTH"
};

function makeSegment(overrides: Partial<RawSegment> = {}): RawSegment {
  return {
    segmentId: "SEG-TEST",
    segmentType: "TURN",
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [3, 4]
      ]
    },
    startPoint: {xM: 0, yM: 0, zM: 0},
    endPoint: {xM: 3, yM: 4, zM: 10},
    distanceM: 5,
    heightM: 10,
    speedMps: 150,
    durationSec: 10,
    fuelConsumptionKg: null,
    turnRadiusM: null,
    stripId: null,
    valid: true,
    ...overrides
  };
}

function makeTrajectory(segments: RawSegment[]): RawTrajectory {
  return {
    trajectoryId: "TRJ-TEST",
    assignmentId: "ASG-TEST",
    uavId: "UAV-TEST",
    segments,
    totalDistanceM: 0,
    totalDurationSec: 0,
    totalFuelKg: null
  };
}

function makeAssignment(plannedLaunchTimeSec = 1206.801): RawAssignment {
  return {
    assignmentId: "ASG-TEST",
    uavId: "UAV-TEST",
    baseId: "BASE-TEST",
    flightCandidateId: "FPC-TEST",
    stripStartIndex: 0,
    stripEndIndex: 0,
    stripIds: [],
    entryVariant: "START",
    plannedLaunchTimeSec,
    batchIndex: 0,
    routeEstimateId: "RTE-TEST",
    coverageRouteId: null
  };
}

function makeTimedSegment(
  segmentId: string,
  timedPath: TimedMapPoint[]
): TimedSegment {
  return {
    segmentId,
    segmentType: "TURN",
    stripId: null,
    startTimeSec: timedPath[0]?.[3] ?? 0,
    endTimeSec: timedPath.at(-1)?.[3] ?? 0,
    heightM: 0,
    speedMps: 0,
    distanceM: 0,
    fuelConsumptionKg: 0,
    localPath: [],
    mapPath: [],
    timedPath
  };
}

describe("trajectory timeline", () => {
  it("starts at the planned launch and accumulates exact segment boundaries", () => {
    const segments = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({segmentId: "SEG-1", durationSec: 19.333}),
        makeSegment({segmentId: "SEG-2", durationSec: 2.667}),
        makeSegment({segmentId: "SEG-3", durationSec: 0.125})
      ]),
      makeAssignment(1206.801),
      transform
    );

    expect(segments[0].startTimeSec).toBe(1206.801);
    expect(segments[0].timedPath[0][3]).toBe(1206.801);
    expect(segments[1].startTimeSec).toBe(segments[0].endTimeSec);
    expect(segments[2].startTimeSec).toBe(segments[1].endTimeSec);
    segments.forEach(segment => {
      expect(segment.timedPath.at(-1)?.[3]).toBe(segment.endTimeSec);
      expect(segment.timedPath.at(-1)?.[3]).toBeCloseTo(segment.endTimeSec, 9);
    });
  });

  it("expands a positive-duration one-vertex climb into vertical endpoints", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-CLIMB",
          segmentType: "CLIMB",
          geometry: {type: "LineString", coordinates: [[7, 8]]},
          startPoint: {xM: 7, yM: 8, zM: 0},
          endPoint: {xM: 7, yM: 8, zM: 2900},
          durationSec: 19.333,
          speedMps: 150
        })
      ]),
      makeAssignment(),
      transform
    );

    expect(segment.localPath).toEqual([
      [7, 8, 0],
      [7, 8, 2900]
    ]);
    expect(segment.mapPath).toHaveLength(2);
    expect(segment.timedPath).toHaveLength(2);
    expect(segment.timedPath.map(point => point[2])).toEqual([0, 2900]);
    expect(segment.timedPath[0][3]).toBe(1206.801);
    expect(segment.timedPath[1][3]).toBe(1206.801 + 19.333);
    expect(segment.speedMps).toBe(150);
  });

  it("expands a positive-duration one-vertex descent from height to zero", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-DESCENT",
          segmentType: "DESCENT",
          geometry: {type: "LineString", coordinates: [[7, 8]]},
          startPoint: {xM: 7, yM: 8, zM: 2900},
          endPoint: {xM: 7, yM: 8, zM: 0},
          durationSec: 7
        })
      ]),
      makeAssignment(),
      transform
    );

    expect(segment.localPath).toEqual([
      [7, 8, 2900],
      [7, 8, 0]
    ]);
    expect(segment.timedPath.map(point => point[2])).toEqual([2900, 0]);
  });

  it("keeps a zero-duration one-vertex takeoff as one exact-time point", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-TAKEOFF",
          segmentType: "TAKEOFF",
          geometry: {type: "LineString", coordinates: [[7, 8]]},
          startPoint: {xM: 7, yM: 8, zM: 0},
          endPoint: {xM: 7, yM: 8, zM: 2900},
          durationSec: 0
        })
      ]),
      makeAssignment(),
      transform
    );

    expect(segment.localPath).toEqual([[7, 8, 0]]);
    expect(segment.mapPath).toHaveLength(1);
    expect(segment.timedPath).toEqual([
      [segment.mapPath[0][0], segment.mapPath[0][1], 0, 1206.801]
    ]);
    expect(segment.startTimeSec).toBe(segment.endTimeSec);
  });

  it("preserves multi-vertex order and allocates height and time by cumulative distance", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-TURN",
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [3, 0],
              [3, 4]
            ]
          },
          startPoint: {xM: 0, yM: 0, zM: 10},
          endPoint: {xM: 3, yM: 4, zM: 80},
          durationSec: 14
        })
      ]),
      makeAssignment(100),
      transform
    );
    const firstLegDistance = Math.hypot(3, 30);
    const secondLegDistance = Math.hypot(4, 40);

    expect(segment.localPath).toEqual([
      [0, 0, 10],
      [3, 0, 40],
      [3, 4, 80]
    ]);
    expect(segment.mapPath).toHaveLength(3);
    expect(segment.timedPath).toHaveLength(3);
    expect(segment.timedPath[1][3]).toBeCloseTo(
      100 + 14 * (firstLegDistance / (firstLegDistance + secondLegDistance)),
      12
    );
    expect(segment.timedPath[2][3]).toBe(114);
  });

  it("falls back to vertex ratios for height when horizontal distance is zero", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-VERTICAL",
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 2],
              [1, 2],
              [1, 2]
            ]
          },
          startPoint: {xM: 1, yM: 2, zM: 0},
          endPoint: {xM: 1, yM: 2, zM: 10}
        })
      ]),
      makeAssignment(),
      transform
    );

    expect(segment.localPath).toEqual([
      [1, 2, 0],
      [1, 2, 5],
      [1, 2, 10]
    ]);
  });

  it("falls back to vertex ratios for time when total 3D distance is zero", () => {
    const [segment] = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({
          segmentId: "SEG-STATIONARY",
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 2],
              [1, 2],
              [1, 2]
            ]
          },
          startPoint: {xM: 1, yM: 2, zM: 5},
          endPoint: {xM: 1, yM: 2, zM: 5},
          durationSec: 12
        })
      ]),
      makeAssignment(20),
      transform
    );

    expect(segment.timedPath.map(point => point[3])).toEqual([20, 26, 32]);
  });

  it.each([
    {
      label: "a negative duration",
      segment: makeSegment({segmentId: "SEG-NEGATIVE", durationSec: -1}),
      assignment: makeAssignment(),
      expected: /SEG-NEGATIVE.*duration/i
    },
    {
      label: "empty geometry",
      segment: makeSegment({
        segmentId: "SEG-EMPTY",
        geometry: {type: "LineString", coordinates: []}
      }),
      assignment: makeAssignment(),
      expected: /SEG-EMPTY.*geometry/i
    },
    {
      label: "a non-finite derived local path",
      segment: makeSegment({
        segmentId: "SEG-PATH",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 0],
            [2, 0]
          ]
        },
        startPoint: {xM: 0, yM: 0, zM: -Number.MAX_VALUE},
        endPoint: {xM: 2, yM: 0, zM: Number.MAX_VALUE}
      }),
      assignment: makeAssignment(),
      expected: /SEG-PATH.*finite/i
    },
    {
      label: "a non-finite accumulated distance",
      segment: makeSegment({
        segmentId: "SEG-DISTANCE",
        geometry: {
          type: "LineString",
          coordinates: [
            [Number.MAX_VALUE, 0],
            [0, 0],
            [Number.MAX_VALUE, 0]
          ]
        },
        startPoint: {xM: Number.MAX_VALUE, yM: 0, zM: 0},
        endPoint: {xM: Number.MAX_VALUE, yM: 0, zM: 0}
      }),
      assignment: makeAssignment(),
      expected: /SEG-DISTANCE.*distance.*finite/i
    },
    {
      label: "an invalid launch time",
      segment: makeSegment({segmentId: "SEG-START"}),
      assignment: makeAssignment(Number.NaN),
      expected: /SEG-START.*time.*finite/i
    },
    {
      label: "an overflowing accumulated time",
      segment: makeSegment({
        segmentId: "SEG-TIME",
        durationSec: Number.MAX_VALUE
      }),
      assignment: makeAssignment(Number.MAX_VALUE),
      expected: /SEG-TIME.*time.*finite/i
    }
  ])("throws a segment-specific error for $label", ({segment, assignment, expected}) => {
    expect(() =>
      buildTrajectoryTimeline(makeTrajectory([segment]), assignment, transform)
    ).toThrow(expected);
  });

  it("de-duplicates every exactly equal adjacent trip tuple", () => {
    const firstPath: TimedMapPoint[] = [
      [1, 2, 3, 4],
      [5, 6, 7, 8]
    ];
    const secondPath: TimedMapPoint[] = [
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [9, 10, 11, 12]
    ];
    const thirdPath: TimedMapPoint[] = [
      [9, 10, 11, 13],
      [14, 15, 16, 17]
    ];
    const segments = [
      makeTimedSegment("SEG-1", firstPath),
      makeTimedSegment("SEG-2", secondPath),
      makeTimedSegment("SEG-3", thirdPath)
    ];
    const before = structuredClone(segments);

    const trip = buildTripPath(segments);

    expect(trip).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [9, 10, 11, 13],
      [14, 15, 16, 17]
    ]);
    expect(trip[0]).not.toBe(firstPath[0]);
    expect(trip[1]).not.toBe(firstPath[1]);
    expect(segments).toEqual(before);
  });

  it("does not mutate trajectory geometry, assignment, or transform inputs", () => {
    const trajectory = makeTrajectory([
      makeSegment({
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [3, 0],
            [3, 4]
          ]
        }
      })
    ]);
    const assignment = makeAssignment();
    const inputTransform = {...transform};
    const trajectoryBefore = structuredClone(trajectory);
    const assignmentBefore = structuredClone(assignment);
    const transformBefore = structuredClone(inputTransform);

    buildTrajectoryTimeline(trajectory, assignment, inputTransform);

    expect(trajectory).toEqual(trajectoryBefore);
    expect(assignment).toEqual(assignmentBefore);
    expect(inputTransform).toEqual(transformBefore);
  });

  it("normalizes nullable segment fuel to zero and preserves numeric fuel", () => {
    const segments = buildTrajectoryTimeline(
      makeTrajectory([
        makeSegment({segmentId: "SEG-NULL-FUEL", fuelConsumptionKg: null}),
        makeSegment({segmentId: "SEG-FUEL", fuelConsumptionKg: 12.75})
      ]),
      makeAssignment(),
      transform
    );

    expect(segments.map(segment => segment.fuelConsumptionKg)).toEqual([0, 12.75]);
  });
});
