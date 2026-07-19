import {render} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {ResolvedBasemap} from "../src/basemap/basemapConfig";
import {WrjKeplerMap} from "../src/components/WrjKeplerMap";

const keplerProps: Array<Record<string, unknown>> = [];

vi.mock("@kepler.gl/components", () => ({
  default: (props: Record<string, unknown>) => {
    keplerProps.push(props);
    return <div data-testid="kepler-gl" />;
  }
}));

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
  keplerProps.length = 0;
});

describe("WrjKeplerMap", () => {
  it("passes public raster styles to the fixed Kepler map instance", () => {
    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} />);

    expect(keplerProps).toHaveLength(1);
    expect(keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "",
      mapStylesReplaceDefault: true,
      width: 960,
      height: 640
    });
    expect((keplerProps[0].mapStyles as Array<{id: string}>).map(({id}) => id)).toEqual([
      "satellite",
      "light"
    ]);
  });

  it("keeps Mapbox defaults when the provider has no custom styles", () => {
    render(<WrjKeplerMap basemap={MAPBOX_BASEMAP} />);

    expect(keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "pk.test-token",
      mapStylesReplaceDefault: false
    });
    expect(keplerProps[0].mapStyles).toBeUndefined();
  });
});
