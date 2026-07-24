export const missionPlanFixture = {
  planId: "PLAN-0001",
  caseId: "CASE-0001",
  assignmentPlan: {
    assignments: [
      {
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
      }
    ],
    stripPlanSnapshot: {
      stripPlanId: "SP-0001",
      flightCandidateId: "FPC-00560",
      regionId: "REGION-0001",
      scanAngleDeg: 0,
      swathWidthM: 120,
      stripSpacingM: 100,
      stripCount: 1,
      strips: [
        {
          stripId: "ST-0001",
          index: 0,
          start: {xM: 100, yM: 200},
          end: {xM: 500, yM: 200},
          lengthM: 400,
          scanAngleDeg: 0,
          coveragePolygon: [
            {xM: 100, yM: 150},
            {xM: 500, yM: 150},
            {xM: 500, yM: 250},
            {xM: 100, yM: 250}
          ]
        }
      ],
      estimatedCoverageRatio: 0.98,
      generationWarnings: [],
      compatibleFlightCandidates: ["FPC-00560"]
    }
  },
  trajectories: [
    {
      trajectoryId: "TRJ-0001",
      assignmentId: "ASG-0001-001",
      uavId: "UAV-04",
      segments: [
        {
          segmentId: "SEG-0001",
          segmentType: "CLIMB",
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [100, 200]
            ]
          },
          startPoint: {xM: 0, yM: 0, zM: 0},
          endPoint: {xM: 100, yM: 200, zM: 120},
          distanceM: 250,
          heightM: 120,
          speedMps: 25,
          durationSec: 10,
          fuelConsumptionKg: 0.5,
          turnRadiusM: null,
          stripId: null,
          valid: true
        },
        {
          segmentId: "SEG-0002",
          segmentType: "COVERAGE_LINE",
          geometry: {
            type: "LineString",
            coordinates: [
              [100, 200],
              [500, 200]
            ]
          },
          startPoint: {xM: 100, yM: 200, zM: 120},
          endPoint: {xM: 500, yM: 200, zM: 120},
          distanceM: 400,
          heightM: 120,
          speedMps: 20,
          durationSec: 20,
          fuelConsumptionKg: 1,
          turnRadiusM: null,
          stripId: "ST-0001",
          valid: true
        },
        {
          segmentId: "SEG-0003",
          segmentType: "DESCENT",
          geometry: {
            type: "LineString",
            coordinates: [
              [500, 200],
              [0, 0]
            ]
          },
          startPoint: {xM: 500, yM: 200, zM: 120},
          endPoint: {xM: 0, yM: 0, zM: 0},
          distanceM: 550,
          heightM: 120,
          speedMps: 25,
          durationSec: 22,
          fuelConsumptionKg: 0.75,
          turnRadiusM: null,
          stripId: null,
          valid: true
        }
      ],
      totalDistanceM: 1200,
      totalDurationSec: 52,
      totalFuelKg: 2.25,
      valid: true,
      failureCodes: []
    }
  ],
  coverageRatio: 0.98,
  missionMakespanSec: 52,
  totalDistanceM: 1200,
  totalFuelKg: 2.25,
  validationReport: {
    valid: true,
    warnings: [],
    failureCodes: []
  },
  finalScore: {
    total: 98.5
  },
  feasible: true,
  failureCodes: []
};
