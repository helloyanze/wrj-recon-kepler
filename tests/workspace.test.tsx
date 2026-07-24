import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {StrictMode} from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {Provider} from "react-redux";
import {afterEach, describe, expect, it, vi} from "vitest";
import {updateMap} from "@kepler.gl/actions";
import {createAppStore} from "../src/app/store";
import type {ResolvedBasemap} from "../src/basemap/basemapConfig";
import {Workspace} from "../src/components/Workspace";
import type {WrjKeplerMapProps} from "../src/components/WrjKeplerMap";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "../src/features/cases/caseBundle";
import type {CaseRepository} from "../src/features/cases/caseRepository";
import type {
  CaseCatalogEntry,
  CaseCatalogV1
} from "../src/features/cases/catalogSchema";
import type {CaseLibraryDependencies} from "../src/hooks/useCaseLibrary";

vi.mock("../src/components/WrjKeplerMap", () => ({
  WrjKeplerMap: () => <div data-testid="default-kepler-map">Kepler map</div>
}));

const PUBLIC_BASEMAP: ResolvedBasemap = {
  provider: "public",
  mapboxToken: "",
  mapStyles: [
    {id: "satellite", style: {version: 8, sources: {}, layers: []}},
    {id: "light", style: {version: 8, sources: {}, layers: []}}
  ],
  mapStylesReplaceDefault: true,
  primaryLabel: "公共地图",
  secondaryLabel: "OSM 简洁图",
  statusLabel: "公共底图",
  attributionByStyle: {
    satellite: "© OpenStreetMap contributors · © CARTO",
    light: "© OpenStreetMap contributors"
  }
};

const R10_BUNDLE = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json"
), "utf8")) as unknown);

function bundleFor(entry: CaseCatalogEntry): CaseBundleV2 {
  return {
    ...structuredClone(R10_BUNDLE),
    case: {
      caseId: entry.caseId,
      planId: entry.planId,
      displayName: entry.displayName
    },
    provenance: {
      ...R10_BUNDLE.provenance,
      sourceRun: entry.runId
    }
  };
}

function entry(caseId: string, planId: string): CaseCatalogEntry {
  return {
    caseId,
    planId,
    displayName: caseId,
    runId: "20260721T192032",
    bundleUrl: `/data/integration-cases/${encodeURIComponent(caseId)}/bundle.json`,
    sourcePath: `${caseId}/20260721T192032/mission_plan.json`,
    metrics: {
      uavCount: 2,
      sortieCount: 5,
      batchCount: 3,
      stripCount: 20,
      missionMakespanSec: 3598.185
    },
    warnings: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function dependencies(
  overrides: Partial<CaseLibraryDependencies> = {}
): CaseLibraryDependencies {
  const r01 = entry("R01-BASELINE-01", "PLAN-001");
  const r10 = entry("R10-LONG-TRANSIT-01", "PLAN-002");
  const catalog: CaseCatalogV1 = {
    version: 1,
    defaultCaseId: r10.caseId,
    cases: [r01, r10]
  };
  const repository: CaseRepository = {
    persistent: true,
    list: vi.fn(async () => []),
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn()
  };
  return {
    loadCaseCatalog: vi.fn(async () => catalog),
    loadBuiltInCase: vi.fn(async catalogEntry => bundleFor(catalogEntry)),
    openCaseRepository: vi.fn(async () => repository),
    ...overrides
  };
}

let latestMapProps: WrjKeplerMapProps | undefined;

function MapStub(props: WrjKeplerMapProps) {
  latestMapProps = props;
  return <div data-testid="kepler-map"><input aria-label="地图输入控件" /></div>;
}

function renderWorkspace(
  caseLibraryDependencies = dependencies(),
  strict = false
) {
  const store = createAppStore(false);
  const workspace = (
    <Provider store={store}>
      <Workspace
        basemap={PUBLIC_BASEMAP}
        debugMode={false}
        dataBase="/data"
        caseLibraryDependencies={caseLibraryDependencies}
        MapView={MapStub}
      />
    </Provider>
  );
  render(strict ? <StrictMode>{workspace}</StrictMode> : workspace);
  return {store, dependencies: caseLibraryDependencies};
}

afterEach(() => {
  cleanup();
  latestMapProps = undefined;
  localStorage.clear();
});

describe("dynamic algorithm Workspace", () => {
  it("loads catalog.defaultCaseId R10 and drives the 3D map from its bundle", async () => {
    const {dependencies: deps} = renderWorkspace();

    expect(screen.getByText("正在加载算例数据…")).toBeInTheDocument();
    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(screen.getByLabelText("选择算例")).toHaveValue(
      "R10-LONG-TRANSIT-01:PLAN-002:built-in"
    );
    expect(screen.getAllByText("R10-LONG-TRANSIT-01")).toHaveLength(2);
    await waitFor(() => expect(latestMapProps?.bundle?.case.caseId)
      .toBe("R10-LONG-TRANSIT-01"));
    expect(latestMapProps).toMatchObject({
      missionTimeSec: expect.any(Number),
      verticalScale: 1,
      preferences: expect.objectContaining({
        caseId: "R10-LONG-TRANSIT-01",
        planId: "PLAN-002"
      })
    });
    expect(deps.loadBuiltInCase).toHaveBeenCalledTimes(1);
  });

  it("keeps the loading shell while the catalog is pending", () => {
    const catalog = deferred<CaseCatalogV1>();
    renderWorkspace(dependencies({
      loadCaseCatalog: vi.fn(() => catalog.promise)
    }));

    expect(screen.getByText("正在加载算例数据…")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "公共地图"})).toBeDisabled();
    expect(latestMapProps?.bundle ?? null).toBeNull();
  });

  it("reports load errors, retries, and then preserves normal controls", async () => {
    const r10 = entry("R10-LONG-TRANSIT-01", "PLAN-002");
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("bundle offline"))
      .mockResolvedValueOnce(bundleFor(r10));
    renderWorkspace(dependencies({loadBuiltInCase: loader}));

    expect(await screen.findByText("算例加载失败")).toBeInTheDocument();
    expect(screen.getByText("bundle offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "重新加载"}));

    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", {name: "公共地图"})).toBeEnabled();
  });

  it("switches cases without injecting legacy Kepler datasets", async () => {
    const {dependencies: deps} = renderWorkspace();
    await screen.findByText("方案可行");

    fireEvent.change(screen.getByLabelText("选择算例"), {
      target: {value: "R01-BASELINE-01:PLAN-001:built-in"}
    });

    await waitFor(() => expect(latestMapProps?.bundle?.case.caseId)
      .toBe("R01-BASELINE-01"));
    expect(screen.getAllByText("R01-BASELINE-01")).toHaveLength(2);
    expect(deps.loadBuiltInCase).toHaveBeenCalledTimes(2);
  });

  it("resets the camera from the current algorithm bundle and ignores R in an input", async () => {
    const {store} = renderWorkspace();
    const dispatch = vi.spyOn(store, "dispatch");
    await screen.findByText("方案可行");
    dispatch.mockClear();

    fireEvent.click(screen.getByRole("button", {name: "重置三维视角"}));
    fireEvent.keyDown(window, {key: "r"});
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([action]) => (
      action as unknown as {payload: {type: string}}
    ).payload.type)).toEqual([updateMap({}).type, updateMap({}).type]);

    const mapInput = screen.getByLabelText("地图输入控件");
    mapInput.focus();
    fireEvent.keyDown(mapInput, {key: "r"});
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("performs one catalog, repository and R10 load under React StrictMode", async () => {
    const deps = dependencies();
    renderWorkspace(deps, true);

    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(deps.loadCaseCatalog).toHaveBeenCalledTimes(1);
    expect(deps.openCaseRepository).toHaveBeenCalledTimes(1);
    expect(deps.loadBuiltInCase).toHaveBeenCalledTimes(1);
  });

  it("switches basemap style only after a bundle is ready", async () => {
    const pending = deferred<CaseBundleV2>();
    const {store} = renderWorkspace(dependencies({
      loadBuiltInCase: vi.fn(() => pending.promise)
    }));
    const dispatch = vi.spyOn(store, "dispatch");
    const light = screen.getByRole("button", {name: "OSM 简洁图"});
    expect(light).toBeDisabled();

    await act(async () => {
      pending.resolve(R10_BUNDLE);
      await pending.promise;
    });
    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    fireEvent.click(light);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
