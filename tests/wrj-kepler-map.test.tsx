import {cleanup, render, screen} from "@testing-library/react";
import {useContext, type Context} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {ResolvedBasemap} from "../src/basemap/basemapConfig";
import {
  FlightOverlayContext,
  mergeDeckRenderCallbacks
} from "../src/components/kepler/UavMapContainer";
import {WrjKeplerMap} from "../src/components/WrjKeplerMap";
import type {UavFlightPath} from "../src/features/flight/flightPaths";

interface OverlayValue {
  paths: readonly UavFlightPath[];
  iconSize: number;
}

const runtime = vi.hoisted(() => ({
  keplerProps: [] as Array<Record<string, unknown>>,
  overlayContext: undefined as Context<OverlayValue> | undefined
}));

vi.mock("@kepler.gl/components", () => ({
  MapContainerFactory: Object.assign(vi.fn(), {deps: [vi.fn(), vi.fn(), vi.fn()]}),
  injectComponents: vi.fn(() => (props: Record<string, unknown>) => {
    if (!runtime.overlayContext) throw new Error("overlay context was not initialized");
    const overlay = useContext(runtime.overlayContext);
    runtime.keplerProps.push(props);
    return (
      <div
        data-testid="kepler-gl"
        data-paths={overlay.paths.length}
        data-icon-size={overlay.iconSize}
      />
    );
  })
}));

runtime.overlayContext = FlightOverlayContext;

vi.mock("../src/hooks/useContainerSize", () => ({
  useContainerSize: () => ({ref: vi.fn(), width: 960, height: 640})
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

const MAPBOX_BASEMAP: ResolvedBasemap = {
  provider: "mapbox",
  mapboxToken: "pk.test-token",
  mapStylesReplaceDefault: false,
  primaryLabel: "卫星地图",
  secondaryLabel: "简洁地图",
  statusLabel: "Mapbox 已配置",
  attributionByStyle: {
    satellite: "© Mapbox © OpenStreetMap contributors",
    light: "© Mapbox © OpenStreetMap contributors"
  }
};

afterEach(() => {
  cleanup();
  runtime.keplerProps.length = 0;
});

describe("WrjKeplerMap", () => {
  it("passes public raster styles to the fixed Kepler map instance", () => {
    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} />);

    expect(runtime.keplerProps).toHaveLength(1);
    expect(runtime.keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "",
      mapStylesReplaceDefault: true,
      width: 960,
      height: 640
    });
    expect((runtime.keplerProps[0].mapStyles as Array<{id: string}>).map(({id}) => id)).toEqual([
      "satellite",
      "light"
    ]);
  });

  it("keeps Mapbox defaults when the provider has no custom styles", () => {
    render(<WrjKeplerMap basemap={MAPBOX_BASEMAP} />);

    expect(runtime.keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "pk.test-token",
      mapStylesReplaceDefault: false
    });
    expect(runtime.keplerProps[0].mapStyles).toBeUndefined();
  });

  it("provides empty paths and a 32 pixel icon size by default", () => {
    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} />);

    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-paths", "0");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-icon-size", "32");
  });

  it("provides custom flight paths and icon size to the injected map container", () => {
    const flightPaths: readonly UavFlightPath[] = [
      {
        uavId: "UAV-01",
        coordinates: [
          [110, 18, 100, 10],
          [111, 19, 200, 20]
        ]
      }
    ];

    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} flightPaths={flightPaths} uavIconSize={56} />);

    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-paths", "1");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-icon-size", "56");
  });
});

describe("mergeDeckRenderCallbacks", () => {
  it("preserves callbacks and appends UAV layers after the original deck layers", () => {
    const onDeckLoad = vi.fn();
    const onDeckAfterRender = vi.fn();
    const originalLayer = {id: "original"};
    const callbacks = mergeDeckRenderCallbacks(
      {
        onDeckLoad,
        onDeckAfterRender,
        onDeckRender: vi.fn(() => ({layers: [originalLayer], marker: "kept"}))
      },
      {
        paths: [
          {
            uavId: "UAV-01",
            coordinates: [
              [110, 18, 100, 10],
              [111, 19, 200, 20]
            ]
          }
        ],
        time: 10,
        visible: true,
        palette: ["#123456"],
        iconSize: 40
      }
    );

    const result = callbacks.onDeckRender?.({layers: [{id: "before-original"}]});
    expect(callbacks.onDeckLoad).toBe(onDeckLoad);
    expect(callbacks.onDeckAfterRender).toBe(onDeckAfterRender);
    expect(result).toMatchObject({marker: "kept"});
    expect((result?.layers as Array<{id: string}>).map(({id}) => id)).toEqual([
      "original",
      "wrj-uav-flight-markers"
    ]);
  });

  it("keeps null from the original onDeckRender callback", () => {
    const callbacks = mergeDeckRenderCallbacks(
      {onDeckRender: () => null},
      {paths: [], time: null, visible: true, iconSize: 32}
    );

    expect(callbacks.onDeckRender?.({layers: []})).toBeNull();
  });
});
