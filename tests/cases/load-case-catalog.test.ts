import {afterEach, describe, expect, it, vi} from "vitest";
import {
  loadBuiltInCase,
  loadCaseCatalog
} from "../../src/features/cases/loadCaseCatalog";
import type {CaseCatalogEntry} from "../../src/features/cases/catalogSchema";
import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

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
    uavCount: 1,
    sortieCount: 1,
    batchCount: 1,
    stripCount: 1,
    missionMakespanSec: 10
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
  assignments: [
    {
      assignmentId: "ASG-001",
      uavId: "UAV-01",
      baseId: "BASE-01",
      flightCandidateId: "FPC-001",
      stripIds: ["ST-001"],
      stripStartIndex: 0,
      stripEndIndex: 0,
      batchIndex: 0,
      plannedLaunchTimeSec: 0
    }
  ],
  sorties: [
    {
      trajectoryId: "TRJ-001",
      assignmentId: "ASG-001",
      uavId: "UAV-01",
      batchIndex: 0,
      plannedLaunchTimeSec: 0,
      stripIds: ["ST-001"],
      totalDistanceM: 1000,
      totalDurationSec: 10,
      totalFuelKg: 1,
      segments: [
        {
          segmentId: "SEG-001",
          segmentType: "COVERAGE_LINE",
          stripId: "ST-001",
          startTimeSec: 0,
          endTimeSec: 10,
          heightM: 1000,
          speedMps: 100,
          distanceM: 1000,
          fuelConsumptionKg: 1,
          localPath: [
            [0, 0, 1000],
            [1000, 0, 1000]
          ],
          mapPath: [
            [110.2, 18.6, 1000],
            [110.21, 18.6, 1000]
          ],
          timedPath: [
            [110.2, 18.6, 1000, 0],
            [110.21, 18.6, 1000, 10]
          ]
        }
      ],
      trip: [
        [110.2, 18.6, 1000, 0],
        [110.21, 18.6, 1000, 10]
      ]
    }
  ],
  strips: [
    {
      stripId: "ST-001",
      index: 0,
      uavId: "UAV-01",
      assignmentId: "ASG-001",
      line: [
        [110.2, 18.6, 0],
        [110.21, 18.6, 0]
      ],
      polygon: [
        [110.2, 18.59, 0],
        [110.21, 18.59, 0],
        [110.21, 18.61, 0],
        [110.2, 18.59, 0]
      ]
    }
  ],
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
    uavCount: 1,
    sortieCount: 1,
    batchCount: 1,
    stripCount: 1,
    coverageRatio: 0,
    missionMakespanSec: 10,
    totalDistanceM: 1000,
    totalFuelKg: 1
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

  it.each([
    {
      label: "caseId",
      value: {
        ...bundle,
        case: {...bundle.case, caseId: "R01-OTHER"}
      },
      expected: catalogEntry.caseId,
      actual: "R01-OTHER"
    },
    {
      label: "planId",
      value: {
        ...bundle,
        case: {...bundle.case, planId: "PLAN-OTHER"}
      },
      expected: catalogEntry.planId,
      actual: "PLAN-OTHER"
    },
    {
      label: "sourceRun",
      value: {
        ...bundle,
        provenance: {...bundle.provenance, sourceRun: "20260101T000000"}
      },
      expected: catalogEntry.runId,
      actual: "20260101T000000"
    }
  ])(
    "rejects a bundle whose $label does not match its catalog entry",
    async ({label, value, expected, actual}) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(value)));

      await expect(loadBuiltInCase(catalogEntry, "/data")).rejects.toThrow(
        new RegExp(
          `${bundleUrl.replaceAll("/", "\\/")}.*${label}.*expected ${expected}.*actual ${actual}`
        )
      );
    }
  );

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

  it("reports the exact catalog URL for invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));

    await expect(loadCaseCatalog("/mirror-data")).rejects.toThrow(
      "解析 /mirror-data/integration-cases/catalog.json 的 JSON 失败"
    );
  });

  it("reports the exact bundle URL for HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("missing", {status: 404, statusText: "Not Found"})
        )
    );

    await expect(
      loadBuiltInCase(catalogEntry, "/mirror-data")
    ).rejects.toThrow(
      "加载 /mirror-data/integration-cases/R10-LONG-TRANSIT-01/bundle.json 失败：404 Not Found"
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

  it.each(["assignments", "sorties", "strips"] as const)(
    "rejects an empty %s collection",
    collection => {
      expect(
        caseBundleSchema.safeParse({...bundle, [collection]: []}).success
      ).toBe(false);
    }
  );

  it.each([
    {field: "uavCount", value: 2},
    {field: "sortieCount", value: 2},
    {field: "batchCount", value: 2},
    {field: "stripCount", value: 2}
  ] as const)(
    "rejects an inconsistent metrics.$field",
    ({field, value}) => {
      expect(
        caseBundleSchema.safeParse({
          ...bundle,
          metrics: {...bundle.metrics, [field]: value}
        }).success
      ).toBe(false);
    }
  );

  it.each([
    {
      label: "sortie assignment",
      value: {
        ...bundle,
        sorties: [
          {...bundle.sorties[0], assignmentId: "ASG-MISSING"}
        ]
      }
    },
    {
      label: "sortie UAV ownership",
      value: {
        ...bundle,
        sorties: [{...bundle.sorties[0], uavId: "UAV-OTHER"}]
      }
    },
    {
      label: "strip assignment",
      value: {
        ...bundle,
        strips: [
          {...bundle.strips[0], assignmentId: "ASG-MISSING"}
        ]
      }
    },
    {
      label: "strip UAV ownership",
      value: {
        ...bundle,
        strips: [{...bundle.strips[0], uavId: "UAV-OTHER"}]
      }
    },
    {
      label: "assignment strip ownership",
      value: {
        ...bundle,
        assignments: [{...bundle.assignments[0], stripIds: ["ST-MISSING"]}]
      }
    }
  ])("rejects inconsistent $label references", ({value}) => {
    expect(caseBundleSchema.safeParse(value).success).toBe(false);
  });

  it("rejects duplicate sortie strip identities that mask a missing strip", () => {
    const secondStrip = {
      ...bundle.strips[0],
      stripId: "ST-002",
      index: 1
    };
    const duplicateSortieStrips = {
      ...bundle,
      assignments: [
        {
          ...bundle.assignments[0],
          stripIds: ["ST-001", "ST-002"],
          stripEndIndex: 1
        }
      ],
      sorties: [
        {
          ...bundle.sorties[0],
          stripIds: ["ST-001", "ST-001"]
        }
      ],
      strips: [...bundle.strips, secondStrip],
      metrics: {...bundle.metrics, stripCount: 2}
    };

    expect(caseBundleSchema.safeParse(duplicateSortieStrips).success).toBe(
      false
    );
  });

  it("parses the committed R10 generated bundle", async () => {
    const raw = await readFile(
      resolve(
        process.cwd(),
        "public/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json"
      ),
      "utf8"
    );

    expect(() => caseBundleSchema.parse(JSON.parse(raw))).not.toThrow();
  });

  it("parses every committed generated bundle in the catalog", async () => {
    const dataRoot = resolve(
      process.cwd(),
      "public/data/integration-cases"
    );
    const committedCatalog = JSON.parse(
      await readFile(resolve(dataRoot, "catalog.json"), "utf8")
    ) as {cases: Array<{caseId: string}>};

    expect(committedCatalog.cases).toHaveLength(14);
    for (const entry of committedCatalog.cases) {
      const raw = await readFile(
        resolve(dataRoot, encodeURIComponent(entry.caseId), "bundle.json"),
        "utf8"
      );
      expect(
        caseBundleSchema.safeParse(JSON.parse(raw)).success,
        entry.caseId
      ).toBe(true);
    }
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

  it("preserves bundle AbortError and passes the caller signal to fetch", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);
    controller.abort();

    await expect(
      loadBuiltInCase(catalogEntry, "/data", controller.signal)
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(bundleUrl, {
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
