import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  createCaseRepository,
  openCaseRepository,
  type CaseDatabaseAdapter,
  type ImportedCaseEntry
} from "../../src/features/cases/caseRepository";
import type {CaseBundleV2} from "../../src/features/cases/caseBundle";
import {convertMissionPlan} from "../../src/features/cases/convertMissionPlan";
import {missionPlanFixture} from "../fixtures/missionPlanFixture";

class MapCaseDatabaseAdapter implements CaseDatabaseAdapter {
  readonly bundles = new Map<string, CaseBundleV2>();
  readonly entries = new Map<string, ImportedCaseEntry>();
  getCalls = 0;
  closed = false;

  async get(key: string): Promise<CaseBundleV2 | undefined> {
    this.getCalls += 1;
    return this.bundles.get(key);
  }

  async list(): Promise<ImportedCaseEntry[]> {
    return [...this.entries.values()];
  }

  async put(
    key: string,
    bundle: CaseBundleV2,
    entry: ImportedCaseEntry
  ): Promise<void> {
    this.bundles.set(key, bundle);
    this.entries.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.bundles.delete(key);
    this.entries.delete(key);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function makeBundle(
  caseId = "CASE-0001",
  planId = "PLAN-0001",
  sha256 = "1".repeat(64)
): CaseBundleV2 {
  const missionPlan = structuredClone(missionPlanFixture);
  missionPlan.caseId = caseId;
  missionPlan.planId = planId;
  return convertMissionPlan({
    missionPlan,
    sourceName: `${caseId}.zip`,
    sourceRun: "20260721T192032",
    importedAt: "2026-07-21T19:20:32.000Z",
    sha256
  });
}

describe("case repository", () => {
  let adapter: MapCaseDatabaseAdapter;

  beforeEach(() => {
    adapter = new MapCaseDatabaseAdapter();
  });

  it("saves, lists and reads a validated bundle", async () => {
    const repository = createCaseRepository(adapter);
    const bundle = makeBundle();

    await repository.save(bundle);

    expect(await repository.list()).toEqual([
      expect.objectContaining({
        caseId: "CASE-0001",
        planId: "PLAN-0001",
        displayName: "CASE-0001",
        importedAt: "2026-07-21T19:20:32.000Z",
        sourceName: "CASE-0001.zip"
      })
    ]);
    expect(await repository.get("CASE-0001", "PLAN-0001")).toEqual(bundle);
  });

  it("lists lightweight entries without reading trajectory bundles", async () => {
    const repository = createCaseRepository(adapter);
    await repository.save(makeBundle());
    const getCallsAfterSave = adapter.getCalls;

    const entries = await repository.list();

    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty("sorties");
    expect(adapter.getCalls).toBe(getCallsAfterSave);
  });

  it("rejects duplicates unless overwrite is explicitly enabled", async () => {
    const repository = createCaseRepository(adapter);
    const original = makeBundle();
    const changed = makeBundle(
      original.case.caseId,
      original.case.planId,
      "2".repeat(64)
    );

    await repository.save(original);
    await expect(repository.save(changed)).rejects.toThrow(/已存在/);

    await repository.save(changed, {overwrite: true});
    expect(
      (await repository.get(
        changed.case.caseId,
        changed.case.planId
      ))?.provenance.sha256
    ).toBe("2".repeat(64));
  });

  it("removes both the full bundle and its list entry", async () => {
    const repository = createCaseRepository(adapter);
    const bundle = makeBundle();
    await repository.save(bundle);

    await repository.remove(bundle.case.caseId, bundle.case.planId);

    expect(await repository.get(bundle.case.caseId, bundle.case.planId))
      .toBeUndefined();
    expect(await repository.list()).toEqual([]);
  });

  it("returns entries in a stable case and plan order", async () => {
    const repository = createCaseRepository(adapter);
    await repository.save(makeBundle("CASE-B", "PLAN-2"));
    await repository.save(makeBundle("CASE-A", "PLAN-2"));
    await repository.save(makeBundle("CASE-A", "PLAN-1"));

    expect(
      (await repository.list()).map(entry => `${entry.caseId}:${entry.planId}`)
    ).toEqual(["CASE-A:PLAN-1", "CASE-A:PLAN-2", "CASE-B:PLAN-2"]);
  });

  it("marks a successfully opened adapter as persistent", async () => {
    const opener = vi.fn(async () => adapter);

    const repository = await openCaseRepository(opener);

    expect(repository.persistent).toBe(true);
    await repository.save(makeBundle());
    expect(adapter.bundles).toHaveProperty("size", 1);
  });

  it("uses one session memory repository when opening IndexedDB fails", async () => {
    const opener = vi.fn(async (): Promise<CaseDatabaseAdapter> => {
      throw new Error("IndexedDB unavailable");
    });
    const bundle = makeBundle("FALLBACK-CASE", "FALLBACK-PLAN");

    const first = await openCaseRepository(opener);
    await first.save(bundle, {overwrite: true});
    const second = await openCaseRepository(opener);

    expect(first.persistent).toBe(false);
    expect(second.persistent).toBe(false);
    expect(
      await second.get(bundle.case.caseId, bundle.case.planId)
    ).toEqual(bundle);
    await second.remove(bundle.case.caseId, bundle.case.planId);
  });

  it("validates bundles before writing them", async () => {
    const repository = createCaseRepository(adapter);
    const invalid = {
      ...makeBundle(),
      provenance: {...makeBundle().provenance, sha256: "invalid"}
    } as CaseBundleV2;

    await expect(repository.save(invalid)).rejects.toThrow(/provenance.*sha256/s);
    expect(adapter.bundles.size).toBe(0);
  });

  it.each([
    {
      operation: "list",
      run: (repository: ReturnType<typeof createCaseRepository>) =>
        repository.list()
    },
    {
      operation: "get",
      run: (repository: ReturnType<typeof createCaseRepository>) =>
        repository.get("CASE", "PLAN")
    },
    {
      operation: "put",
      run: (repository: ReturnType<typeof createCaseRepository>) =>
        repository.save(makeBundle())
    },
    {
      operation: "delete",
      run: (repository: ReturnType<typeof createCaseRepository>) =>
        repository.remove("CASE", "PLAN")
    }
  ])("propagates adapter $operation failures", async ({operation, run}) => {
    const failure = new Error(`${operation} failed`);
    const failingAdapter: CaseDatabaseAdapter = {
      get: operation === "get"
        ? async () => { throw failure; }
        : adapter.get.bind(adapter),
      list: operation === "list"
        ? async () => { throw failure; }
        : adapter.list.bind(adapter),
      put: operation === "put"
        ? async () => { throw failure; }
        : adapter.put.bind(adapter),
      delete: operation === "delete"
        ? async () => { throw failure; }
        : adapter.delete.bind(adapter),
      close: adapter.close.bind(adapter)
    };

    await expect(run(createCaseRepository(failingAdapter))).rejects.toBe(
      failure
    );
  });
});
