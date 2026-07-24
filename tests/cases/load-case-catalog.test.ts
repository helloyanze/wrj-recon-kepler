import {afterEach, describe, expect, it, vi} from "vitest";
import {
  loadBuiltInCase,
  loadCaseCatalog
} from "../../src/features/cases/loadCaseCatalog";
import type {CaseCatalogEntry} from "../../src/features/cases/catalogSchema";

const catalogUrl = "/data/integration-cases/catalog.json";
const bundleUrl =
  "/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json";

const catalogEntry: CaseCatalogEntry = {
  caseId: "R10-LONG-TRANSIT-01",
  planId: "PLAN-002",
  displayName: "R10-LONG-TRANSIT-01",
  runId: "20260721T192032",
  bundleUrl,
  sourcePath:
    "R10-LONG-TRANSIT-01/20260721T192032/mission_plan.json",
  metrics: {
    uavCount: 0,
    sortieCount: 0,
    batchCount: 0,
    stripCount: 0,
    missionMakespanSec: 0
  },
  warnings: []
};

const catalog = {
  version: 1,
  defaultCaseId: catalogEntry.caseId,
  cases: [catalogEntry]
};

const bundle = {
  version: 2,
  case: {
    caseId: catalogEntry.caseId,
    planId: catalogEntry.planId,
    displayName: catalogEntry.displayName
  },
  assignments: [],
  sorties: [],
  strips: [],
  region: {
    source: "DERIVED_FROM_STRIPS",
    polygon: [
      [110.2, 18.6, 0],
      [110.3, 18.6, 0],
      [110.2, 18.7, 0],
      [110.2, 18.6, 0]
    ]
  },
  metrics: {
    uavCount: 0,
    sortieCount: 0,
    batchCount: 0,
    stripCount: 0,
    coverageRatio: 0,
    missionMakespanSec: 0,
    totalDistanceM: 0,
    totalFuelKg: 0
  },
  validation: {
    valid: true,
    warnings: [],
    failureCodes: []
  },
  displayTransform: {
    anchorLongitude: 110.235,
    anchorLatitude: 18.625,
    sourceCenterXM: 0,
    sourceCenterYM: 0,
    xAxis: "EAST",
    yAxis: "NORTH"
  },
  provenance: {
    sourceName:
      "R10-LONG-TRANSIT-01/20260721T192032/mission_plan.json",
    sourceRun: "20260721T192032",
    importedAt: "2026-07-21T19:20:32.000Z",
    sha256: "1".repeat(64)
  }
};

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: {"Content-Type": "application/json"},
    ...init
  });
}

describe("algorithm case catalog loaders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and validates the built-in catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(catalog));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadCaseCatalog("/data")).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith(catalogUrl, {signal: undefined});
  });

  it("loads and validates a catalog entry bundle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(bundle));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadBuiltInCase(catalogEntry, "/data")).resolves.toEqual(
      bundle
    );
    expect(fetchMock).toHaveBeenCalledWith(bundleUrl, {signal: undefined});
  });

  it("rebases catalog and bundle URLs onto a mirror data root", async () => {
    const responses = new Map<string, unknown>([
      ["/mirror-data/integration-cases/catalog.json", catalog],
      [
        "/mirror-data/integration-cases/R10-LONG-TRANSIT-01/bundle.json",
        bundle
      ]
    ]);
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const value = responses.get(url);
      return Promise.resolve(
        value === undefined
          ? new Response("missing", {status: 404, statusText: "Not Found"})
          : jsonResponse(value)
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const loadedCatalog = await loadCaseCatalog("/mirror-data/");
    await loadBuiltInCase(loadedCatalog.cases[0], "/mirror-data/");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/mirror-data/integration-cases/catalog.json",
      "/mirror-data/integration-cases/R10-LONG-TRANSIT-01/bundle.json"
    ]);
  });

  it("reports the exact catalog URL for HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("missing", {status: 404, statusText: "Not Found"})
        )
    );

    await expect(loadCaseCatalog("/mirror-data")).rejects.toThrow(
      "加载 /mirror-data/integration-cases/catalog.json 失败：404 Not Found"
    );
  });

  it("reports the exact bundle URL for invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));

    await expect(
      loadBuiltInCase(catalogEntry, "/mirror-data")
    ).rejects.toThrow(
      "解析 /mirror-data/integration-cases/R10-LONG-TRANSIT-01/bundle.json 的 JSON 失败"
    );
  });

  it("reports catalog schema failures with the source URL and reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({...catalog, version: 99}))
    );

    await expect(loadCaseCatalog("/data")).rejects.toThrow(
      /\/data\/integration-cases\/catalog\.json.*version/
    );
  });

  it("reports bundle schema failures with the source URL and reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...bundle,
          metrics: {...bundle.metrics, missionMakespanSec: "invalid"}
        })
      )
    );

    await expect(
      loadBuiltInCase(catalogEntry, "/data")
    ).rejects.toThrow(
      /\/data\/integration-cases\/R10-LONG-TRANSIT-01\/bundle\.json.*metrics\.missionMakespanSec/
    );
  });

  it("preserves AbortError and passes the caller signal to fetch", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    await expect(
      loadCaseCatalog("/data", controller.signal)
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(catalogUrl, {
      signal: controller.signal
    });
  });

  it.each([
    "https://evil.example/data",
    "//evil.example/data",
    "/mirror-data/../escape"
  ])("rejects unsafe data roots before fetching: %s", async dataBase => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadCaseCatalog(dataBase)).rejects.toThrow(/dataBase/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
