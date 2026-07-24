import {StrictMode, type PropsWithChildren} from "react";
import {act, renderHook, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {CaseBundleV2} from "../../src/features/cases/caseBundle";
import type {CaseRepository, ImportedCaseEntry} from "../../src/features/cases/caseRepository";
import type {CaseCatalogEntry, CaseCatalogV1} from "../../src/features/cases/catalogSchema";
import {
  useCaseLibrary,
  type CaseLibraryDependencies
} from "../../src/hooks/useCaseLibrary";

const DEFAULT_CASE_ID = "R10-LONG-TRANSIT-01";

function makeBundle(caseId: string, planId: string): CaseBundleV2 {
  return {
    version: 2,
    case: {caseId, planId, displayName: caseId},
    assignments: [{
      assignmentId: "ASG-1",
      uavId: "UAV-01",
      baseId: "BASE-1",
      flightCandidateId: "FPC-1",
      stripIds: ["ST-1"],
      stripStartIndex: 0,
      stripEndIndex: 0,
      batchIndex: 0,
      plannedLaunchTimeSec: 0
    }],
    sorties: [{
      trajectoryId: "TRJ-1",
      assignmentId: "ASG-1",
      uavId: "UAV-01",
      batchIndex: 0,
      plannedLaunchTimeSec: 0,
      stripIds: ["ST-1"],
      totalDistanceM: 1,
      totalDurationSec: 1,
      totalFuelKg: 1,
      segments: [{
        segmentId: "SEG-1",
        segmentType: "COVERAGE_LINE",
        stripId: "ST-1",
        startTimeSec: 0,
        endTimeSec: 1,
        heightM: 100,
        speedMps: 1,
        distanceM: 1,
        fuelConsumptionKg: 1,
        localPath: [[0, 0, 100], [1, 0, 100]],
        mapPath: [[110.2, 18.6, 100], [110.20001, 18.6, 100]],
        timedPath: [[110.2, 18.6, 100, 0], [110.20001, 18.6, 100, 1]]
      }],
      trip: [[110.2, 18.6, 100, 0], [110.20001, 18.6, 100, 1]]
    }],
    strips: [{
      stripId: "ST-1",
      index: 0,
      uavId: "UAV-01",
      assignmentId: "ASG-1",
      line: [[110.2, 18.6, 0], [110.20001, 18.6, 0]],
      polygon: [
        [110.2, 18.6, 0],
        [110.20001, 18.6, 0],
        [110.20001, 18.60001, 0],
        [110.2, 18.6, 0]
      ]
    }],
    region: {
      source: "DERIVED_FROM_STRIPS",
      polygon: [
        [110.2, 18.6, 0],
        [110.20001, 18.6, 0],
        [110.20001, 18.60001, 0],
        [110.2, 18.6, 0]
      ]
    },
    metrics: {
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      coverageRatio: 1,
      missionMakespanSec: 1,
      totalDistanceM: 1,
      totalFuelKg: 1
    },
    validation: {valid: true, warnings: [], failureCodes: []},
    displayTransform: {
      anchorLongitude: 110.235,
      anchorLatitude: 18.625,
      sourceCenterXM: 0,
      sourceCenterYM: 0,
      xAxis: "EAST",
      yAxis: "NORTH"
    },
    provenance: {
      sourceName: `${caseId}.json`,
      sourceRun: "20260721T192032",
      importedAt: "2026-07-21T19:20:32.000Z",
      sha256: "1".repeat(64)
    }
  };
}

function catalogEntry(caseId: string, planId: string): CaseCatalogEntry {
  return {
    caseId,
    planId,
    displayName: caseId,
    runId: "20260721T192032",
    bundleUrl: `/data/integration-cases/${encodeURIComponent(caseId)}/bundle.json`,
    sourcePath: `${caseId}/20260721T192032/mission_plan.json`,
    metrics: {
      uavCount: 1,
      sortieCount: 1,
      batchCount: 1,
      stripCount: 1,
      missionMakespanSec: 1
    },
    warnings: []
  };
}

function importedEntry(caseId: string, planId: string): ImportedCaseEntry {
  return {
    caseId,
    planId,
    displayName: caseId,
    importedAt: "2026-07-22T00:00:00.000Z",
    sourceName: `${caseId}.zip`,
    sourceRun: "20260721T192032",
    metrics: makeBundle(caseId, planId).metrics,
    warnings: []
  };
}

function createHarness(options?: {
  catalog?: CaseCatalogV1;
  imported?: ImportedCaseEntry[];
  persistent?: boolean;
  loadBuiltIn?: CaseLibraryDependencies["loadBuiltInCase"];
}) {
  const r10 = catalogEntry(DEFAULT_CASE_ID, "PLAN-002");
  const r01 = catalogEntry("R01-BASELINE-01", "PLAN-001");
  const catalog = options?.catalog ?? {
    version: 1,
    defaultCaseId: DEFAULT_CASE_ID,
    cases: [r01, r10]
  };
  let imported = options?.imported ?? [];
  const bundles = new Map<string, CaseBundleV2>(
    imported.map(entry => [
      `${entry.caseId}:${entry.planId}`,
      makeBundle(entry.caseId, entry.planId)
    ])
  );
  const repository: CaseRepository = {
    persistent: options?.persistent ?? true,
    list: vi.fn(async () => [...imported]),
    get: vi.fn(async (caseId, planId) => bundles.get(`${caseId}:${planId}`)),
    save: vi.fn(),
    remove: vi.fn(async (caseId, planId) => {
      imported = imported.filter(entry =>
        entry.caseId !== caseId || entry.planId !== planId
      );
      bundles.delete(`${caseId}:${planId}`);
    })
  };
  const dependencies: CaseLibraryDependencies = {
    loadCaseCatalog: vi.fn(async () => catalog),
    loadBuiltInCase: options?.loadBuiltIn ?? vi.fn(async entry =>
      makeBundle(entry.caseId, entry.planId)
    ),
    openCaseRepository: vi.fn(async () => repository)
  };
  return {catalog, repository, dependencies};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCaseLibrary", () => {
  it("merges built-in and imported entries with stable source-labelled keys", async () => {
    const imported = importedEntry("LOCAL-CASE", "PLAN-9");
    const {dependencies} = createHarness({imported: [imported], persistent: false});
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.entries.map(({key, source}) => ({key, source}))).toEqual([
      {key: "R01-BASELINE-01:PLAN-001:built-in", source: "built-in"},
      {key: "R10-LONG-TRANSIT-01:PLAN-002:built-in", source: "built-in"},
      {key: "LOCAL-CASE:PLAN-9:imported", source: "imported"}
    ]);
    expect(result.current.persistentImports).toBe(false);
  });

  it("selects the catalog default case, or the first built-in when it is unavailable", async () => {
    const first = catalogEntry("R01-BASELINE-01", "PLAN-001");
    const defaultHarness = createHarness();
    const fallbackHarness = createHarness({
      catalog: {version: 1, defaultCaseId: first.caseId, cases: [first]}
    });

    const defaultHook = renderHook(() =>
      useCaseLibrary({dataBase: "/data", dependencies: defaultHarness.dependencies})
    );
    await waitFor(() => expect(defaultHook.result.current.status).toBe("ready"));
    expect(defaultHook.result.current.selectedKey)
      .toBe("R10-LONG-TRANSIT-01:PLAN-002:built-in");
    defaultHook.unmount();

    const fallbackHook = renderHook(() =>
      useCaseLibrary({dataBase: "/data", dependencies: fallbackHarness.dependencies})
    );
    await waitFor(() => expect(fallbackHook.result.current.status).toBe("ready"));
    expect(fallbackHook.result.current.selectedKey)
      .toBe("R01-BASELINE-01:PLAN-001:built-in");
  });

  it("aborts the previous HTTP load when switching built-in cases", async () => {
    let firstSignal: AbortSignal | undefined;
    const loadBuiltIn = vi.fn((entry: CaseCatalogEntry, _base?: string, signal?: AbortSignal) => {
      if (entry.caseId === DEFAULT_CASE_ID) {
        firstSignal = signal;
        return new Promise<CaseBundleV2>(() => undefined);
      }
      return Promise.resolve(makeBundle(entry.caseId, entry.planId));
    });
    const {dependencies} = createHarness({loadBuiltIn});
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));

    await waitFor(() => expect(firstSignal).toBeDefined());
    act(() => result.current.select("R01-BASELINE-01:PLAN-001:built-in"));

    await waitFor(() => expect(result.current.bundle?.case.caseId).toBe("R01-BASELINE-01"));
    expect(firstSignal?.aborted).toBe(true);
  });

  it("loads imported selections from the repository instead of HTTP", async () => {
    const imported = importedEntry("LOCAL-CASE", "PLAN-9");
    const {dependencies, repository} = createHarness({imported: [imported]});
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.select("LOCAL-CASE:PLAN-9:imported"));
    await waitFor(() => expect(result.current.bundle?.case.caseId).toBe("LOCAL-CASE"));

    expect(repository.get).toHaveBeenCalledWith("LOCAL-CASE", "PLAN-9");
    expect(dependencies.loadBuiltInCase).toHaveBeenCalledTimes(1);
  });

  it("deletes the selected imported case, refreshes entries and returns to the default", async () => {
    const imported = importedEntry("LOCAL-CASE", "PLAN-9");
    const {dependencies, repository} = createHarness({imported: [imported]});
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.select("LOCAL-CASE:PLAN-9:imported"));
    await waitFor(() => expect(result.current.bundle?.case.caseId).toBe("LOCAL-CASE"));

    await act(() => result.current.deleteImported("LOCAL-CASE:PLAN-9:imported"));

    await waitFor(() => expect(result.current.bundle?.case.caseId).toBe(DEFAULT_CASE_ID));
    expect(repository.remove).toHaveBeenCalledWith("LOCAL-CASE", "PLAN-9");
    expect(result.current.entries.some(({source}) => source === "imported")).toBe(false);
  });

  it("performs one effective built-in load under React StrictMode", async () => {
    const {dependencies} = createHarness();
    const wrapper = ({children}: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

    const {result} = renderHook(
      () => useCaseLibrary({dataBase: "/data", dependencies}),
      {wrapper}
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(dependencies.loadCaseCatalog).toHaveBeenCalledTimes(1);
    expect(dependencies.openCaseRepository).toHaveBeenCalledTimes(1);
    expect(dependencies.loadBuiltInCase).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous bundle visible when a new case fails", async () => {
    const loadBuiltIn = vi.fn(async (entry: CaseCatalogEntry) => {
      if (entry.caseId === "R01-BASELINE-01") throw new Error("bundle offline");
      return makeBundle(entry.caseId, entry.planId);
    });
    const {dependencies} = createHarness({loadBuiltIn});
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));
    await waitFor(() => expect(result.current.bundle?.case.caseId).toBe(DEFAULT_CASE_ID));

    act(() => result.current.select("R01-BASELINE-01:PLAN-001:built-in"));
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.bundle?.case.caseId).toBe(DEFAULT_CASE_ID);
    expect(result.current.error).toContain("bundle offline");
  });

  it("refreshes imported entries without reloading the selected bundle", async () => {
    const {dependencies, repository} = createHarness();
    const {result} = renderHook(() => useCaseLibrary({dataBase: "/data", dependencies}));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(() => result.current.refreshImports());

    expect(repository.list).toHaveBeenCalledTimes(2);
    expect(dependencies.loadBuiltInCase).toHaveBeenCalledTimes(1);
  });
});
