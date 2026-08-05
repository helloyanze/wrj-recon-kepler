export const missionViewFixture = {
  schemaVersion: "mission_view.v1",
  mission: {
    missionId: "MIS-R01-BASELINE-01",
    caseId: "R01-BASELINE-01"
  },
  activePlan: {
    planId: "PLAN-001-T2-V2",
    planStatus: "COMPLETE",
    planVersion: 2,
    sourcePlanVersion: 1,
    missionTimeSec: 100
  },
  coordinateReference: {
    frame: "LOCAL_ENU",
    horizontalUnit: "m",
    verticalUnit: "m",
    mapCrs: null
  },
  tasks: [
    {
      taskId: "REG-001",
      taskType: "AREA_RECON",
      status: "EXECUTING",
      priority: 1,
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [1_000, 0],
          [1_000, 1_000],
          [0, 0]
        ]]
      },
      minimumCoverageRatio: 0.95
    }
  ],
  resources: [
    {
      resourceId: "UAV-01",
      platformClass: "SMALL_UAV",
      carrierResourceId: null,
      capabilities: ["AREA_RECON"],
      operationalState: "EXECUTING",
      position: {xM: 100, yM: 200, zM: 2_500},
      headingDeg: 90,
      remainingFuelKg: 70
    }
  ],
  workUnits: [
    {
      workUnitId: "ST-0001",
      taskId: "REG-001",
      status: "REMAINING",
      assignedResourceId: "UAV-01",
      geometry: {
        type: "LineString",
        coordinates: [
          [100, 200, 2_500],
          [500, 200, 2_500]
        ]
      }
    }
  ],
  assignments: [
    {
      assignmentId: "ASG-DYNAMIC-001",
      resourceId: "UAV-01",
      taskId: "REG-001",
      workUnitIds: ["ST-0001"],
      plannedLaunchTimeSec: 100,
      plannedFinishTimeSec: 120
    }
  ],
  trajectories: [
    {
      trajectoryId: "TRJ-DYNAMIC-001",
      resourceId: "UAV-01",
      segments: [
        {
          segmentId: "SEG-DYNAMIC-001",
          segmentType: "COVERAGE_LINE",
          phase: "MISSION",
          localPath: [
            {xM: 100, yM: 200, zM: 2_500},
            {xM: 500, yM: 200, zM: 2_500}
          ],
          mapPath: [],
          startTimeSec: 100,
          finishTimeSec: 120,
          changeType: "dynamic_modified",
          taskId: "REG-001",
          workUnitId: "ST-0001"
        }
      ]
    }
  ],
  eventTimeline: [
    {
      eventId: "EV-DEMO-LOST",
      eventType: "RESOURCE_LOST",
      eventTimeSec: 100,
      status: "COMMITTED",
      affectedObjectId: "UAV-01"
    }
  ],
  planDiff: {
    sourcePlanVersion: 1,
    planVersion: 2,
    entries: [
      {
        elementType: "RESOURCE",
        elementId: "UAV-01",
        changeType: "dynamic_modified",
        beforeHash: "before",
        afterHash: "after",
        triggerEventIds: ["EV-DEMO-LOST"]
      }
    ]
  },
  metrics: {
    highPriorityCompletionRatio: 1,
    totalCompletionRatio: 1,
    retainedPlanRatio: 0.5,
    newActiveResourceCount: 1,
    totalFinishTimeSec: 600,
    totalFuelKg: 1.5
  },
  validation: {
    passed: true,
    checks: [
      {
        name: "safe-return",
        passed: true,
        code: null,
        message: null,
        affectedObjectIds: []
      }
    ],
    failureCodes: []
  },
  alternativeSummaries: [],
  timeChains: [
    {
      nodeId: "NODE-EVENT",
      nodeType: "EVENT",
      resourceId: "UAV-01",
      taskId: null,
      startTimeSec: 100,
      finishTimeSec: 100,
      predecessorNodeIds: []
    }
  ],
  provenance: {
    eventBatchId: "B-DEMO-LOST",
    snapshotId: "SNAP-123456789ABC",
    sourceHashes: {
      "mission_plan.json": "abc123"
    }
  }
} as const;

export const failureReportFixture = {
  attemptId: "FAIL-123456789ABC",
  sourcePlanVersion: 1,
  failures: [
    {
      code: "HARD_DEADLINE_MISSED",
      stage: "VALIDATION",
      message: "硬截止无法满足，已发布安全回退方案。",
      affectedObjectIds: ["REG-001"],
      recoverable: false,
      details: {}
    }
  ]
} as const;

const decisionStages = [
  "EVENT_INGESTION",
  "SNAPSHOT_AND_IMPACT",
  "RESOURCE_ASSESSMENT",
  "CANDIDATE_GENERATION",
  "PLANNING_AND_VALIDATION",
  "RANKING_AND_SELECTION",
  "PLAN_PUBLICATION"
] as const;

export const decisionTraceFixture = {
  schemaVersion: "decision_trace.v1",
  attemptId: "ATTEMPT-123456789ABC",
  missionId: "MIS-R01-BASELINE-01",
  eventBatchId: "B-DEMO-LOST",
  sourcePlanVersion: 1,
  resultStatus: "COMPLETE",
  selectedCandidateId: "CAND-1",
  stages: decisionStages.map((stageId, index) => ({
    stageId,
    status: "COMPLETED" as const,
    actualDurationMs: 1,
    affectedEventIds: ["EV-DEMO-LOST"],
    affectedObjectIds: ["UAV-01"],
    facts: [],
    candidateIds: index >= 3 ? ["CAND-1"] : [],
    validationCheckIds: [],
    failureCodes: [],
    artifactRefs: []
  })),
  candidates: [
    {
      candidateId: "CAND-1",
      level: "L1_MINIMAL_ADJUSTMENT",
      lifecycle: "selected",
      affectedTaskIds: ["REG-001"],
      affectedResourceIds: ["UAV-01"],
      allocations: [
        {
          taskId: "REG-001",
          resourceIds: ["UAV-01"],
          workUnitIds: ["ST-0001"]
        }
      ],
      facts: [{
        code: "ALLOCATED_TASK_COUNT",
        value: 1,
        unit: "COUNT",
        objectIds: ["REG-001"]
      }],
      metrics: missionViewFixture.metrics,
      validationChecks: [],
      rejectionCodes: [],
      failureCodes: [],
      rank: 1,
      selected: true
    }
  ],
  selection: {
    orderedCandidateIds: ["CAND-1"],
    selectedCandidateId: "CAND-1",
    reasonCodes: ["LEXICOGRAPHIC_RANKING"]
  },
  publication: {
    planId: "PLAN-001-T2-V2",
    planVersion: 2,
    planStatus: "COMPLETE",
    sourcePlanVersion: 1,
    planDiffRefs: [
      {
        elementType: "RESOURCE",
        elementId: "UAV-01",
        changeType: "dynamic_modified"
      }
    ],
    failureReportPath: null
  }
} as const;

export const sceneConfigFixture = {
  schemaVersion: "task2-demo-scene.v2",
  sceneId: "resource-lost",
  displayName: "无人机失联",
  summary: "执行中无人机失联，剩余工作转移给可用资源。",
  baselineCaseId: "R01-BASELINE-01",
  resultStatus: "COMPLETE",
  playback: {
    baselineLeadInSec: 15,
    eventAlertMs: 1_800,
    impactRevealMs: 2_200,
    replanExplainerMs: 3_200,
    planTransitionMs: 2_400,
    resultHoldMs: 5_000
  },
  camera: {
    eventTargetKind: "RESOURCE",
    eventTargetId: "UAV-01",
    overviewPaddingPx: 48
  }
} as const;

export const scenePackageFixture = {
  sceneId: "resource-lost",
  displayName: "无人机失联",
  summary: "执行中无人机失联，剩余工作转移给可用资源。",
  baseUrl: "task2/scenes/resource-lost",
  resultStatus: "COMPLETE",
  failureReportUrl: null
} as const;

const fixtureHash = "a".repeat(64);

export const sceneProvenanceFixture = {
  schemaVersion: "task2-demo-provenance.v1",
  task2Commit: "abc1234",
  generationCommand: "task2-replan export-demo-scenes",
  generatedAt: "2026-07-30T00:00:00Z",
  snapshotSource: "SIMULATED",
  baselinePlanVersion: 1,
  upstreamSha256: {
    "scene.json": fixtureHash,
    "mission_view.v1.json": fixtureHash,
    "decision_trace.v1.json": fixtureHash
  },
  packagedSha256: {
    "scene.json": fixtureHash,
    "baseline.bundle.json": fixtureHash,
    "mission_view.v1.json": fixtureHash,
    "decision_trace.v1.json": fixtureHash
  }
} as const;
