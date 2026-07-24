import {describe, expect, it} from "vitest";
import type {
  LocalPoint,
  MapPoint,
  NormalizedSortie,
  SegmentType,
  TimedMapPoint,
  TimedSegment
} from "../../src/features/cases/caseBundle";
import {
  selectSortieStates
} from "../../src/features/mission/missionInterpolation";

interface SegmentOptions {
  id?: string;
  type?: SegmentType;
  start?: number;
  end?: number;
  speed?: number;
  localPath?: LocalPoint[];
  mapPath?: MapPoint[];
  timedPath?: TimedMapPoint[];
}

function makeSegment({
  id = "SEG-1",
  type = "ENTRY",
  start = 0,
  end = 10,
  speed = 100,
  localPath = [
    [0, 0, 100],
    [100, 0, 100]
  ],
  mapPath = [
    [110, 18, 100],
    [110.001, 18, 100]
  ],
  timedPath = mapPath.map(
    (point, index): TimedMapPoint => [
      point[0],
      point[1],
      point[2],
      start + (end - start) * index / Math.max(1, mapPath.length - 1)
    ]
  )
}: SegmentOptions = {}): TimedSegment {
  return {
    segmentId: id,
    segmentType: type,
    stripId: null,
    startTimeSec: start,
    endTimeSec: end,
    heightM: mapPath.at(-1)?.[2] ?? 0,
    speedMps: speed,
    distanceM: 100,
    fuelConsumptionKg: 1,
    localPath,
    mapPath,
    timedPath
  };
}

function makeSortie(
  assignmentId: string,
  uavId: string,
  batchIndex: number,
  segments: TimedSegment[],
  launchTime = segments[0]?.startTimeSec ?? 0,
  totalDuration = segments.length === 0
    ? 0
    : (segments.at(-1)?.endTimeSec ?? launchTime) - launchTime
): NormalizedSortie {
  return {
    trajectoryId: `TRAJ-${assignmentId}`,
    assignmentId,
    uavId,
    batchIndex,
    plannedLaunchTimeSec: launchTime,
    stripIds: ["STRIP-1"],
    totalDistanceM: 100,
    totalDurationSec: totalDuration,
    totalFuelKg: 1,
    segments,
    trip: segments.flatMap(segment => segment.timedPath)
  };
}

function horizontalSegment(
  id: string,
  start: number,
  end: number
): TimedSegment {
  return makeSegment({id, start, end});
}

describe("selectSortieStates", () => {
  it("activates R10-like sorties in their exact algorithm batch order", () => {
    const sorties = [
      makeSortie("A-1", "UAV-01", 0, [horizontalSegment("S-1", 0, 1_200)]),
      makeSortie("A-2", "UAV-02", 0, [horizontalSegment("S-2", 0, 1_200)]),
      makeSortie(
        "A-3",
        "UAV-01",
        1,
        [horizontalSegment("S-3", 1_206.801, 2_406.801)]
      ),
      makeSortie(
        "A-4",
        "UAV-02",
        1,
        [horizontalSegment("S-4", 1_206.801, 2_406.801)]
      ),
      makeSortie(
        "A-5",
        "UAV-01",
        2,
        [horizontalSegment("S-5", 2_415.788, 3_598.185)]
      )
    ];

    expect(
      selectSortieStates(sorties, -1).every(({status}) => status === "waiting")
    ).toBe(true);
    expect(
      selectSortieStates(sorties, 0).filter(({status}) => status === "flying")
    ).toHaveLength(2);
    expect(
      selectSortieStates(sorties, 1_206.8)
        .filter(({status}) => status === "flying")
    ).toHaveLength(0);
    expect(
      selectSortieStates(sorties, 1_206.801)
        .filter(({status}) => status === "flying")
    ).toHaveLength(2);
    expect(
      selectSortieStates(sorties, 2_415.788)
        .filter(({status}) => status === "flying")
    ).toHaveLength(1);
  });

  it("interpolates a fixed-horizontal climb using true altitude and segment speed", () => {
    const climb = makeSegment({
      id: "CLIMB",
      type: "CLIMB",
      start: 0,
      end: 10,
      speed: 150,
      localPath: [
        [0, 0, 0],
        [0, 0, 2_900]
      ],
      mapPath: [
        [110, 18, 0],
        [110, 18, 2_900]
      ]
    });
    const entry = makeSegment({
      id: "ENTRY",
      start: 10,
      end: 20,
      localPath: [
        [0, 0, 2_900],
        [100, 0, 2_900]
      ],
      mapPath: [
        [110, 18, 2_900],
        [110.001, 18, 2_900]
      ]
    });

    const [state] = selectSortieStates(
      [makeSortie("A-1", "UAV-01", 0, [climb, entry])],
      5
    );

    expect(state).toMatchObject({
      status: "flying",
      segmentType: "CLIMB",
      altitudeM: 1_450,
      speedMps: 150
    });
    expect(state.position).toEqual([110, 18, 1_450]);
    expect(state.localPosition).toEqual([0, 0, 1_450]);
    expect(state.headingDeg).toBeCloseTo(90, 6);
  });

  it("uses the current non-identical TURN leg for clockwise-from-north heading", () => {
    const turn = makeSegment({
      id: "TURN",
      type: "TURN",
      start: 0,
      end: 10,
      localPath: [
        [0, 0, 100],
        [100, 0, 100],
        [100, 100, 100]
      ],
      mapPath: [
        [110, 18, 100],
        [110.001, 18, 100],
        [110.001, 18.001, 100]
      ],
      timedPath: [
        [110, 18, 100, 0],
        [110.001, 18, 100, 5],
        [110.001, 18.001, 100, 10]
      ]
    });
    const sortie = makeSortie("A-1", "UAV-01", 0, [turn]);

    expect(selectSortieStates([sortie], 2)[0].headingDeg).toBeCloseTo(90, 6);
    expect(selectSortieStates([sortie], 7)[0].headingDeg).toBeCloseTo(0, 6);
  });

  it("retains the preceding horizontal heading through a vertical segment", () => {
    const entry = horizontalSegment("ENTRY", 0, 10);
    const climb = makeSegment({
      id: "CLIMB",
      type: "CLIMB",
      start: 10,
      end: 20,
      localPath: [
        [100, 0, 100],
        [100, 0, 2_900]
      ],
      mapPath: [
        [110.001, 18, 100],
        [110.001, 18, 2_900]
      ]
    });

    const [state] = selectSortieStates(
      [makeSortie("A-1", "UAV-01", 0, [entry, climb])],
      15
    );

    expect(state.headingDeg).toBeCloseTo(90, 6);
  });

  it("selects the later segment at an exact shared boundary", () => {
    const first = makeSegment({id: "FIRST", type: "ENTRY", start: 0, end: 10});
    const second = makeSegment({
      id: "SECOND",
      type: "TURN",
      start: 10,
      end: 20,
      speed: 42,
      localPath: [
        [100, 0, 100],
        [100, 100, 100]
      ],
      mapPath: [
        [110.001, 18, 100],
        [110.001, 18.001, 100]
      ]
    });

    expect(
      selectSortieStates(
        [makeSortie("A-1", "UAV-01", 0, [first, second])],
        10
      )[0]
    ).toMatchObject({
      status: "flying",
      segmentType: "TURN",
      speedMps: 42,
      position: [110.001, 18, 100]
    });
  });

  it("keeps the final marker landed for exactly three seconds", () => {
    const sortie = makeSortie(
      "A-1",
      "UAV-01",
      0,
      [horizontalSegment("ENTRY", 0, 10)]
    );

    expect(selectSortieStates([sortie], 10)[0]).toMatchObject({
      status: "landed",
      position: [110.001, 18, 100],
      localPosition: [100, 0, 100],
      speedMps: 0
    });
    expect(selectSortieStates([sortie], 12.999)[0].status).toBe("landed");
    expect(selectSortieStates([sortie], 13)[0]).toMatchObject({
      status: "completed",
      position: null,
      localPosition: null,
      headingDeg: null,
      altitudeM: 0,
      speedMps: 0
    });
  });

  it("handles empty and zero-duration paths without inventing telemetry", () => {
    const empty = makeSortie("EMPTY", "UAV-01", 0, [], 5, 10);
    const stationary = makeSortie(
      "ZERO",
      "UAV-02",
      0,
      [makeSegment({
        start: 5,
        end: 5,
        localPath: [[0, 0, 0]],
        mapPath: [[110, 18, 0]],
        timedPath: [[110, 18, 0, 5]]
      })],
      5,
      0
    );

    expect(selectSortieStates([empty], 4)[0].status).toBe("waiting");
    expect(selectSortieStates([empty], 10)[0]).toMatchObject({
      status: "flying",
      position: null,
      localPosition: null,
      headingDeg: null,
      altitudeM: 0,
      speedMps: 0
    });
    expect(selectSortieStates([empty], 15)[0].status).toBe("landed");
    expect(selectSortieStates([stationary], 5)[0]).toMatchObject({
      status: "landed",
      position: [110, 18, 0]
    });
  });

  it("does not mutate normalized sortie data", () => {
    const sorties = [
      makeSortie("A-1", "UAV-01", 0, [horizontalSegment("ENTRY", 0, 10)])
    ];
    const before = structuredClone(sorties);

    selectSortieStates(sorties, 5);

    expect(sorties).toEqual(before);
  });
});
