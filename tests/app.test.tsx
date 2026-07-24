import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";
import App from "../src/App";
import {resolveBasemap, type ResolvedBasemap} from "../src/basemap/basemapConfig";

const workspaceProps: Array<{basemap: ResolvedBasemap; debugMode: boolean; dataBase: string}> = [];

vi.mock("../src/components/Workspace", () => ({
  Workspace: (props: {basemap: ResolvedBasemap; debugMode: boolean; dataBase: string}) => {
    workspaceProps.push(props);
    return <div data-testid="workspace">Workspace</div>;
  }
}));

afterEach(() => {
  cleanup();
  workspaceProps.length = 0;
});

async function publicBasemap(): Promise<ResolvedBasemap> {
  return resolveBasemap({mode: "public"});
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

describe("App basemap bootstrap", () => {
  it("uses a keyless public basemap without showing the old token setup page", async () => {
    render(<App basemapEnvironment={{mode: "public"}} />);

    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(workspaceProps[0]).toMatchObject({
      basemap: {provider: "public", mapboxToken: ""},
      debugMode: false,
      dataBase: "/data"
    });
    expect(screen.queryByRole("heading", {name: "底图配置失败"})).not.toBeInTheDocument();
  });

  it("passes a configured local basemap into the same workspace shell", async () => {
    const localBasemap = await resolveBasemap({
      mode: "local",
      localStyleUrl: "/maps/style.json",
      localAttribution: "内部地图服务"
    }, undefined, vi.fn(async () => new Response(JSON.stringify({
      version: 8,
      sources: {},
      layers: []
    }), {status: 200})));
    const loader = vi.fn(async () => localBasemap);

    render(<App basemapEnvironment={{mode: "local"}} basemapLoader={loader} />);

    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(workspaceProps[0].basemap).toMatchObject({
      provider: "local",
      primaryLabel: "本地地图"
    });
  });

  it("shows loading while the basemap loader is pending", () => {
    const loader = vi.fn(() => new Promise<ResolvedBasemap>(() => undefined));
    render(<App basemapEnvironment={{mode: "public"}} basemapLoader={loader} />);

    expect(screen.getByRole("main")).not.toHaveAttribute("aria-live");
    expect(screen.getByRole("status")).toHaveTextContent("正在准备地图底图…");
    expect(screen.getByText("正在准备地图底图…").previousElementSibling).toHaveAttribute("aria-hidden", "true");
  });

  it("shows an error and retries the basemap loader", async () => {
    const resolved = await publicBasemap();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("style unavailable"))
      .mockResolvedValueOnce(resolved);
    render(<App basemapEnvironment={{mode: "public"}} basemapLoader={loader} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("底图配置失败");
    expect(screen.getByRole("heading", {name: "底图配置失败"})).toBeInTheDocument();
    expect(screen.getByText("style unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "重新加载底图"}));

    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("reports an explicit Mapbox configuration error when no token is supplied", async () => {
    render(<App basemapEnvironment={{mode: "mapbox"}} />);

    expect(await screen.findByRole("heading", {name: "底图配置失败"})).toBeInTheDocument();
    expect(screen.getByText(/Mapbox Token/)).toBeInTheDocument();
    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });

  it("aborts the loader on unmount and ignores its cancellation rejection", async () => {
    let signal: AbortSignal | undefined;
    const loader = vi.fn((_environment, receivedSignal?: AbortSignal) => {
      signal = receivedSignal;
      return new Promise<ResolvedBasemap>((_resolve, reject) => {
        receivedSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const {unmount} = render(<App basemapEnvironment={{mode: "public"}} basemapLoader={loader} />);

    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
  });

  it("keeps debugMode and dataBase flowing into Workspace", async () => {
    render(
      <App
        basemapEnvironment={{mode: "public"}}
        debugMode
        dataBase="/custom-data"
      />
    );

    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(workspaceProps[0]).toMatchObject({
      basemap: {provider: "public", mapboxToken: ""},
      debugMode: true,
      dataBase: "/custom-data"
    });
  });

  it("only accepts the latest request when obsolete loaders ignore cancellation", async () => {
    const staleRequests = [deferred<ResolvedBasemap>(), deferred<ResolvedBasemap>()];
    const current = deferred<ResolvedBasemap>();
    let staleIndex = 0;
    const staleLoader = vi.fn(() => staleRequests[staleIndex++].promise);
    const currentLoader = vi.fn(() => current.promise);
    const resolved = await publicBasemap();
    const staleResult: ResolvedBasemap = {...resolved, mapboxToken: "stale-token"};
    const {rerender} = render(
      <StrictMode>
        <App basemapEnvironment={{mode: "public"}} basemapLoader={staleLoader} />
      </StrictMode>
    );

    await waitFor(() => expect(staleLoader).toHaveBeenCalledTimes(2));
    rerender(
      <StrictMode>
        <App basemapEnvironment={{mode: "public"}} basemapLoader={currentLoader} />
      </StrictMode>
    );
    await waitFor(() => expect(currentLoader).toHaveBeenCalled());
    await act(async () => {
      current.resolve(resolved);
      await current.promise;
    });
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();

    await act(async () => {
      staleRequests[0].resolve(staleResult);
      staleRequests[1].reject(new Error("stale configuration failure"));
      await Promise.all([
        staleRequests[0].promise,
        staleRequests[1].promise.catch(() => undefined)
      ]);
    });
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(workspaceProps.at(-1)).toMatchObject({
      basemap: {provider: "public", mapboxToken: ""},
      debugMode: false,
      dataBase: "/data"
    });
  });

  it("does not reload for a semantically identical basemap environment", async () => {
    const loader = vi.fn().mockResolvedValue(await publicBasemap());
    const {rerender} = render(
      <App basemapEnvironment={{mode: "public", mapboxToken: ""}} basemapLoader={loader} />
    );
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    rerender(<App basemapEnvironment={{mode: "public", mapboxToken: ""}} basemapLoader={loader} />);

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
  });
});
