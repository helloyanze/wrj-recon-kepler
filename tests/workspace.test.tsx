import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {StrictMode} from "react";
import {mapStyleChange, updateMap} from "@kepler.gl/actions";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {Provider} from "react-redux";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createAppStore} from "../src/app/store";
import {caseManifestSchema, caseSummarySchema} from "../src/data/caseSchema";
import type {CaseBundle} from "../src/data/loadCase";
import {Workspace} from "../src/components/Workspace";

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

const MapStub = () => <div data-testid="kepler-map">Kepler map</div>;

function renderWorkspace(
  caseLoader = vi.fn().mockResolvedValue(makeBundle()),
  keplerLoader = vi.fn().mockResolvedValue(undefined),
  store = createAppStore(false)
) {
  render(
    <Provider store={store}>
      <Workspace
        mapboxToken="test-token"
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
  it("loads the fixed case and renders metrics, UAVs and permanent provenance", async () => {
    const {caseLoader, keplerLoader} = renderWorkspace();

    expect(screen.getByText("正在加载算例数据…")).toBeInTheDocument();
    expect(await screen.findByText("63.23 km")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getAllByRole("button", {name: /UAV-0[1-3]/})).toHaveLength(3);
    expect(screen.getByTestId("kepler-map")).toBeInTheDocument();
    expect(screen.getByText(/本演示不构成真实飞行计划或空域信息/)).toBeInTheDocument();
    expect(screen.getByText(/© OpenStreetMap contributors/)).toBeInTheDocument();
    expect(screen.getByText(/© Mapbox/)).toBeInTheDocument();
    expect(caseLoader).toHaveBeenCalledTimes(1);
    expect(keplerLoader).toHaveBeenCalledTimes(1);
  });

  it("updates UAV details and clears selection with Escape", async () => {
    renderWorkspace();
    await screen.findByText("63.23 km");

    fireEvent.click(screen.getByRole("button", {name: /UAV-02/}));
    expect(screen.getByRole("heading", {name: "UAV-02 任务详情"})).toBeInTheDocument();
    expect(screen.getByText("WRJ02")).toBeInTheDocument();
    expect(screen.getByText("139.5 m")).toBeInTheDocument();

    fireEvent.keyDown(window, {key: "Escape"});
    expect(screen.getByRole("heading", {name: "任务总览"})).toBeInTheDocument();
  });

  it("retries a failed case load", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(makeBundle());
    renderWorkspace(loader);

    expect(await screen.findByText("算例加载失败")).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByText(/本演示不构成真实飞行计划或空域信息/)).toBeInTheDocument();
    expect(screen.getByText(/© OpenStreetMap contributors/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "重新加载"}));

    expect(await screen.findByText("63.23 km")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("dispatches reset and basemap actions from buttons and the R shortcut", async () => {
    const store = createAppStore(false);
    const dispatch = vi.spyOn(store, "dispatch");
    renderWorkspace(undefined, undefined, store);
    await screen.findByText("63.23 km");

    fireEvent.click(screen.getByRole("button", {name: "简洁地图"}));
    fireEvent.click(screen.getByRole("button", {name: "重置三维视角"}));
    fireEvent.keyDown(window, {key: "r"});

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(3));
    const actions = dispatch.mock.calls.map(([action]) => action as unknown as {
      meta: {_addr_: string};
      payload: {type: string};
    });
    expect(actions.map(({meta}) => meta._addr_)).toEqual([
      "@@KG_WRJ-MAP",
      "@@KG_WRJ-MAP",
      "@@KG_WRJ-MAP"
    ]);
    expect(actions.map(({payload}) => payload.type)).toEqual([
      mapStyleChange("light").type,
      updateMap({}).type,
      updateMap({}).type
    ]);
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
            mapboxToken="test-token"
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
    expect(await screen.findByText("63.23 km")).toBeInTheDocument();
    expect(keplerLoader).toHaveBeenCalledTimes(1);
  });
});
