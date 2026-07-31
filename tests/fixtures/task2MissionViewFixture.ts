export const missionViewFixture = {
  schemaVersion: "mission_view.v1",
  mission: {
    missionId: "MIS-R01-BASELINE-01",
    caseId: "R01-BASELINE-01",
    sourcePlanId: "PLAN-001",
    sourcePlanVersion: 1,
    snapshotId: "SNAP-123456789ABC",
    snapshotKind: "SIMULATED",
    snapshotTimeSec: 100
  },
  activePlan: {
    planId: "PLAN-001-T2-V2",
    planVersion: 2,
    parentPlanVersion: 1,
    planStatus: "COMPLETE",
    committedAtMissionTimeSec: 100
  },
  coordinateReference: {
    localFrame: "TASK1_PLANAR_METERS",
    mapCrs: null,
    horizontalUnit: "m",
    verticalUnit: "m",
    xAxis: "EAST",
    yAxis: "NORTH"
  },
  tasks: [
    {
      taskId: "REG-001",
      taskType: "AREA_RECON",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [1_000, 0],
          [1_000, 1_000],
          [0, 0]
        ]]
      },
      minimumCoverageRatio: 0.95,
      executionState: "EXECUTING",
      assignedResourceIds: ["UAV-01"],
      changeType: "dynamic_modified"
    }
  ],
  resources: [
    {
      resourceId: "UAV-01",
      model: "WRJ-A",
      baseId: "BASE-01",
      operationalState: "ACTIVE",
      position: [100, 200, 2_500],
      initialFuelKg: 90,
      remainingFuelKg: 70,
      currentTaskId: "REG-001",
      currentTrajectoryId: "TRJ-DYNAMIC-001",
      transferable: false,
      returnedToBase: false
    }
  ],
  workUnits: [
    {
      workUnitId: "ST-0001",
      taskId: "REG-001",
      localPath: [
        [100, 200, 2_500],
        [500, 200, 2_500]
      ],
      assignedResourceId: "UAV-01",
      executionState: "PLANNED",
      changeType: "dynamic_modified"
    }
  ],
  assignments: [
    {
      assignmentId: "ASG-DYNAMIC-001",
      taskId: "REG-001",
      resourceId: "UAV-01",
      workUnitIds: ["ST-0001"],
      startTimeSec: 100,
      finishTimeSec: 120,
      changeType: "dynamic_modified"
    }
  ],
  trajectories: [
    {
      trajectoryId: "TRJ-DYNAMIC-001",
      resourceId: "UAV-01",
      assignmentId: "ASG-DYNAMIC-001",
      segments: [
        {
          segmentId: "SEG-DYNAMIC-001",
          taskId: "REG-001",
          workUnitId: "ST-0001",
          segmentType: "COVERAGE_LINE",
          startTimeSec: 100,
          finishTimeSec: 120,
          localPath: [
            [100, 200, 2_500],
            [500, 200, 2_500]
          ],
          mapPath: null,
          distanceM: 400,
          fuelKg: 1.5,
          changeType: "dynamic_modified"
        }
      ],
      changeType: "dynamic_modified"
    }
  ],
  eventTimeline: [
    {
      eventId: "EV-DEMO-LOST",
      eventType: "RESOURCE_LOST",
      eventTimeSec: 100,
      affectedObjectKind: "RESOURCE",
      affectedObjectId: "UAV-01",
      payload: {}
    }
  ],
  planDiff: {
    sourcePlanVersion: 1,
    targetPlanVersion: 2,
    entries: [
      {
        objectKind: "RESOURCE",
        objectId: "UAV-01",
        changeType: "dynamic_modified",
        reason: "RESOURCE_LOST"
      }
    ]
  },
  metrics: {
    totalFinishTimeSec: 120,
    totalFuelKg: 1.5,
    totalCompletionRatio: 1,
    retainedWorkRatio: 0.5,
    newResourceCount: 1,
    unresolvedWorkUnitCount: 0
  },
  validation: {
    valid: true,
    safe: true,
    warnings: ["SIMULATED_RUNTIME_STATE"],
    failureCodes: []
  },
  alternativeSummaries: [],
  timeChains: [
    {
      nodeId: "B-DEMO-LOST-EVENT",
      nodeType: "EVENT",
      missionTimeSec: 100,
      wallOffsetMs: 0,
      label: "动态事件到达"
    },
    {
      nodeId: "B-DEMO-LOST-COMMIT",
      nodeType: "COMMIT",
      missionTimeSec: 100,
      wallOffsetMs: 9_600,
      label: "新方案生效"
    }
  ],
  provenance: {
    baselineCaseId: "R01-BASELINE-01",
    baselinePlanId: "PLAN-001",
    baselinePlanVersion: 1,
    eventBatchId: "B-DEMO-LOST",
    runtimeStateSource: "SIMULATED",
    algorithm: "deterministic-strip-reassignment-v1"
  }
} as const;

export const failureReportFixture = {
  schemaVersion: "task2-failure-report.v1",
  missionId: "MIS-R01-BASELINE-01",
  eventBatchId: "B-DEMO-HARD-DEADLINE",
  planStatus: "PARTIAL_SAFE_FALLBACK",
  failureCodes: ["HARD_DEADLINE_UNSATISFIABLE"],
  unresolvedTaskIds: ["REG-001"],
  unresolvedWorkUnitIds: ["ST-0002"],
  safeActions: ["RETURN_TO_BASE"],
  message: "硬截止无法满足；已发布安全返航方案。"
} as const;

export const sceneConfigFixture = {
  schemaVersion: "task2-demo-scene.v1",
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
    "mission_view.v1.json": fixtureHash
  },
  packagedSha256: {
    "scene.json": fixtureHash,
    "baseline.bundle.json": fixtureHash,
    "mission_view.v1.json": fixtureHash
  }
} as const;
