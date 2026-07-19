import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import App from "../src/App";
import {resolveBasemap, type ResolvedBasemap} from "../src/basemap/basemapConfig";

const workspaceProps: Array<{mapboxToken: string; debugMode: boolean; dataBase: string}> = [];

vi.mock("../src/components/Workspace", () => ({
  Workspace: (props: {mapboxToken: string; debugMode: boolean; dataBase: string}) => {
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

describe("App basemap bootstrap", () => {
  it("uses a keyless public basemap without showing the old token setup page", async () => {
    render(<App basemapEnvironment={{mode: "public"}} />);

    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(workspaceProps).toEqual([{mapboxToken: "", debugMode: false, dataBase: "/data"}]);
    expect(screen.queryByRole("heading", {name: "底图配置失败"})).not.toBeInTheDocument();
  });

  it("shows loading while the basemap loader is pending", () => {
    const loader = vi.fn(() => new Promise<ResolvedBasemap>(() => undefined));
    render(<App basemapEnvironment={{mode: "public"}} basemapLoader={loader} />);

    expect(screen.getByText("正在准备地图底图…")).toBeInTheDocument();
  });

  it("shows an error and retries the basemap loader", async () => {
    const resolved = await publicBasemap();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("style unavailable"))
      .mockResolvedValueOnce(resolved);
    render(<App basemapEnvironment={{mode: "public"}} basemapLoader={loader} />);

    expect(await screen.findByRole("heading", {name: "底图配置失败"})).toBeInTheDocument();
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
    expect(workspaceProps[0]).toEqual({mapboxToken: "", debugMode: true, dataBase: "/custom-data"});
  });
});
