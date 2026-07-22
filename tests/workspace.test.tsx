import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {StrictMode} from "react";
import {mapStyleChange, updateMap} from "@kepler.gl/actions";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {Provider} from "react-redux";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createAppStore} from "../src/app/store";
import {caseManifestSchema, caseSummarySchema} from "../src/data/caseSchema";
import type {CaseBundle} from "../src/data/loadCase";
import {Workspace} from "../src/components/Workspace";
import type {ResolvedBasemap} from "../src/basemap/basemapConfig";

vi.mock("../src/components/WrjKeplerMap", () => ({
  WrjKeplerMap: () => <div data-testid="default-kepler-map">Kepler map</div>
}));

afterEach(cleanup);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

function makeBundle(): CaseBundle {
  return {
    manifest: caseManifestSchema.parse(
      readJson("public/data/riyue-3d/case-manifest.json")
    ),
    summary: caseSummarySchema.parse(
      readJson("public/data/riyue-3d/simulated/summary.json")
    ),
    keplerConfig: {},
    datasets: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

const MapStub = () => (
  <div data-testid="kepler-map">
    Kepler map
    <input aria-label="地图输入控件" />
  </div>
);

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

const LOCAL_BASEMAP: ResolvedBasemap = {
  provider: "local",
  mapboxToken: "",
  mapStyles: [
    {id: "satellite", style: {version: 8, sources: {}, layers: []}},
    {id: "light", style: {version: 8, sources: {}, layers: []}}
  ],
  mapStylesReplaceDefault: true,
  primaryLabel: "本地地图",
  secondaryLabel: "公共备用",
  statusLabel: "本地底图",
  attributionByStyle: {
    satellite: "© 本地测绘数据",
    light: "© OpenStreetMap contributors"
  }
};

function renderWorkspace(
  caseLoader = vi.fn().mockResolvedValue(makeBundle()),
  keplerLoader = vi.fn().mockResolvedValue(undefined),
  store = createAppStore(false),
  basemap = PUBLIC_BASEMAP
) {
  render(
    <Provider store={store}>
      <Workspace
        basemap={basemap}
        debugMode={false}
        dataBase="/data"
        caseLoader={caseLoader}
        keplerLoader={keplerLoader}
        MapView={MapStub}
      />
    </Provider>
  );
  return {store, caseLoader, keplerLoader};
}

describe("WRJ workspace", () => {
  it("renders the simplified map-first shell and moves metrics into the overview drawer", async () => {
    renderWorkspace();
    await screen.findByText("方案可行");

    expect(screen.getByRole("heading", {name: "图层"})).toBeInTheDocument();
    expect(screen.queryByLabelText("任务指标")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("任务阶段")).not.toBeInTheDocument();
    expect(screen.queryByText("63.23 km")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "任务概览"}));
    expect(screen.getByRole("dialog", {name: "任务概览"})).toBeInTheDocument();
    expect(screen.getByText("63.23 km")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("keeps the six fixed layers in the sidebar and collapses to an icon rail", async () => {
    renderWorkspace();
    await screen.findByText("方案可行");

    const layerList = screen.getByRole("list", {name: "图层列表"});
    expect(layerList.textContent).toContain("真实 POI");
    expect(layerList.textContent).toContain("真实上下文");
    expect(layerList.textContent).toContain("模拟任务区域");
    expect(layerList.textContent).toContain("模拟侦察条带");
    expect(layerList.textContent).toContain("模拟规划航迹");
    expect(layerList.textContent).toContain("模拟 Trip");

    fireEvent.click(screen.getByRole("button", {name: "收起图层"}));
    expect(screen.getByRole("complementary", {name: "图层"})).toHaveStyle({width: "44px"});
    fireEvent.click(screen.getByRole("button", {name: "展开图层"}));
    expect(screen.getByRole("heading", {name: "图层"})).toBeInTheDocument();
  });

  it("prevents basemap changes until the fixed case is ready", async () => {
    const pendingCase = deferred<CaseBundle>();
    const store = createAppStore(false);
    const dispatch = vi.spyOn(store, "dispatch");
    renderWorkspace(vi.fn(() => pendingCase.promise), undefined, store);

    const primaryButton = screen.getByRole("button", {name: "公共地图"});
    const secondaryButton = screen.getByRole("button", {name: "OSM 简洁图"});
    expect(primaryButton).toBeDisabled();
    expect(secondaryButton).toBeDisabled();
    fireEvent.click(secondaryButton);
    expect(dispatch).not.toHaveBeenCalled();

    await act(async () => {
      pendingCase.resolve(makeBundle());
      await pendingCase.promise;
    });
    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(primaryButton).toBeEnabled();
    expect(secondaryButton).toBeEnabled();
    fireEvent.click(secondaryButton);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({_addr_: "@@KG_WRJ-MAP"}),
      payload: expect.objectContaining({type: mapStyleChange("light").type})
    }));
  });

  it("does not render the custom provenance overlay while case data is loading", () => {
    renderWorkspace(vi.fn(() => new Promise<CaseBundle>(() => undefined)));

    expect(screen.getByText("正在加载算例数据…")).toBeInTheDocument();
    expect(screen.queryByText("© OpenStreetMap contributors · © CARTO")).not.toBeInTheDocument();
  });

  it("loads the fixed case and renders the simplified shell, UAVs and permanent provenance", async () => {
    const {caseLoader, keplerLoader} = renderWorkspace();

    expect(screen.getByText("正在加载算例数据…")).toBeInTheDocument();
    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(screen.queryByText("63.23 km")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: /UAV-0[1-3]/})).toHaveLength(3);
    expect(screen.getByTestId("kepler-map")).toBeInTheDocument();
    expect(screen.queryByText(/本演示不构成真实飞行计划或空域信息/)).not.toBeInTheDocument();
    expect(screen.queryByText("© OpenStreetMap contributors · © CARTO")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "公共地图"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "OSM 简洁图"})).toBeInTheDocument();
    expect(caseLoader).toHaveBeenCalledTimes(1);
    expect(keplerLoader).toHaveBeenCalledTimes(1);
  });

  it("switches public attribution from CARTO to OSM for the light style", async () => {
    renderWorkspace();
    await screen.findByText("方案可行");
    fireEvent.click(screen.getByRole("button", {name: "任务概览"}));
    expect(screen.getByText("© OpenStreetMap contributors · © CARTO")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "OSM 简洁图"}));

    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
    expect(screen.queryByText("© OpenStreetMap contributors · © CARTO")).not.toBeInTheDocument();
  });

  it("switches local attribution to OSM for the public fallback style", async () => {
    renderWorkspace(undefined, undefined, undefined, LOCAL_BASEMAP);
    await screen.findByText("方案可行");

    fireEvent.click(screen.getByRole("button", {name: "任务概览"}));
    expect(screen.getByText("© 本地测绘数据")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "公共备用"}));

    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
    expect(screen.queryByText("© 本地测绘数据")).not.toBeInTheDocument();
  });

  it("updates UAV details and clears selection with Escape", async () => {
    renderWorkspace();
    await screen.findByText("方案可行");

    fireEvent.click(screen.getByRole("button", {name: /UAV-02/}));
    expect(screen.getByRole("dialog", {name: "UAV-02 任务详情"})).toBeInTheDocument();
    expect(screen.getByText("WRJ02")).toBeInTheDocument();
    expect(screen.getByText("139.5 m")).toBeInTheDocument();

    fireEvent.keyDown(window, {key: "Escape"});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retries a failed case load", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(makeBundle());
    renderWorkspace(loader);

    expect(await screen.findByText("算例加载失败")).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.queryByText(/本演示不构成真实飞行计划或空域信息/)).not.toBeInTheDocument();
    expect(screen.queryByText("© OpenStreetMap contributors · © CARTO")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "重新加载"}));

    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("dispatches reset and basemap actions from buttons and the R shortcut", async () => {
    const store = createAppStore(false);
    const dispatch = vi.spyOn(store, "dispatch");
    renderWorkspace(undefined, undefined, store);
    await screen.findByText("方案可行");

    fireEvent.click(screen.getByRole("button", {name: "OSM 简洁图"}));
    fireEvent.click(screen.getByRole("button", {name: "公共地图"}));
    fireEvent.click(screen.getByRole("button", {name: "重置三维视角"}));
    fireEvent.keyDown(window, {key: "r"});

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(4));
    const actions = dispatch.mock.calls.map(([action]) => action as unknown as {
      meta: {_addr_: string};
      payload: {type: string};
    });
    expect(actions.map(({meta}) => meta._addr_)).toEqual([
      "@@KG_WRJ-MAP",
      "@@KG_WRJ-MAP",
      "@@KG_WRJ-MAP",
      "@@KG_WRJ-MAP"
    ]);
    expect(actions.map(({payload}) => payload.type)).toEqual([
      mapStyleChange("light").type,
      mapStyleChange("satellite").type,
      updateMap({}).type,
      updateMap({}).type
    ]);

    const mapInput = screen.getByLabelText("地图输入控件");
    mapInput.focus();
    fireEvent.keyDown(mapInput, {key: "r"});
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it("performs one effective Kepler injection under React StrictMode", async () => {
    const caseLoader = vi.fn().mockResolvedValue(makeBundle());
    let finishInjection: (() => void) | undefined;
    const keplerLoader = vi.fn(
      () => new Promise<void>((resolve) => { finishInjection = resolve; })
    );
    const store = createAppStore(false);

    render(
      <StrictMode>
        <Provider store={store}>
          <Workspace
            basemap={PUBLIC_BASEMAP}
            debugMode={false}
            dataBase="/data"
            caseLoader={caseLoader}
            keplerLoader={keplerLoader}
            MapView={MapStub}
          />
        </Provider>
      </StrictMode>
    );

    await waitFor(() => expect(keplerLoader).toHaveBeenCalledTimes(1));
    finishInjection?.();
    expect(await screen.findByText("方案可行")).toBeInTheDocument();
    expect(keplerLoader).toHaveBeenCalledTimes(1);
  });
});
