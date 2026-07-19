// @vitest-environment node
import {describe, expect, it, vi} from "vitest";
import {
  createRasterStyle,
  resolveBasemap
} from "../src/basemap/basemapConfig";

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

describe("resolveBasemap", () => {
  it("uses public raster basemaps by default", async () => {
    const result = await resolveBasemap({});

    expect(result).toMatchObject({
      provider: "public",
      mapStylesReplaceDefault: true,
      primaryLabel: "公共地图",
      secondaryLabel: "OSM 简洁图",
      statusLabel: "公共底图"
    });
    expect(result.mapboxToken).toBe("");
    expect(result.mapStyles?.map(({id}) => id)).toEqual(["satellite", "light"]);
  });

  it("prefers a local XYZ source over a Mapbox token in auto mode", async () => {
    const result = await resolveBasemap({
      mapboxToken: "token",
      localTileUrl: "https://tiles.example/{z}/{x}/{y}.png"
    });

    expect(result).toMatchObject({provider: "local", statusLabel: "本地底图"});
    expect(result.mapboxToken).toBe("");
    expect(result.mapStyles?.[0].style.sources.raster.tiles).toEqual([
      "https://tiles.example/{z}/{x}/{y}.png"
    ]);
  });

  it("uses Mapbox in auto mode when a non-empty token is available", async () => {
    await expect(resolveBasemap({mapboxToken: "  token  "})).resolves.toMatchObject({
      provider: "mapbox",
      mapboxToken: "token",
      mapStylesReplaceDefault: false,
      primaryLabel: "卫星地图",
      secondaryLabel: "简洁地图",
      statusLabel: "Mapbox 已配置"
    });
  });

  it("honors explicit public mode over configured local and Mapbox sources", async () => {
    await expect(
      resolveBasemap({
        mode: "public",
        mapboxToken: "token",
        localTileUrl: "https://tiles.example/{z}/{x}/{y}.png"
      })
    ).resolves.toMatchObject({provider: "public"});
  });

  it("rejects an invalid mode with a Chinese configuration error", async () => {
    await expect(resolveBasemap({mode: "other"})).rejects.toThrow(
      /^底图配置错误：/
    );
  });

  it("reports missing required configuration for explicit providers", async () => {
    await expect(resolveBasemap({mode: "mapbox"})).rejects.toThrow("Mapbox Token");
    await expect(resolveBasemap({mode: "local"})).rejects.toThrow("本地地图");
  });

  it("validates all XYZ placeholders", async () => {
    await expect(
      resolveBasemap({mode: "local", localTileUrl: "https://tiles.example/{z}/{x}.png"})
    ).rejects.toThrow("{y}");
  });

  it("creates a public raster style with Carto subdomains and OSM fallback", async () => {
    const result = await resolveBasemap({mode: "public"});
    const [satellite, light] = result.mapStyles!;

    expect(satellite).toMatchObject({id: "satellite", style: {version: 8}});
    expect(satellite.style.sources.raster.tiles).toEqual([
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
    ]);
    expect(satellite.style.sources.raster.attribution).toBe(
      "© OpenStreetMap contributors · © CARTO"
    );
    expect(result.attribution).toBe("© OpenStreetMap contributors · © CARTO");
    expect(light.style.sources.raster.tiles).toEqual([
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    ]);
    expect(light.style.sources.raster.attribution).toBe(OSM_ATTRIBUTION);
    expect(createRasterStyle(["https://tiles.example/{z}/{x}/{y}.png"], "Example", 512)).toEqual({
      version: 8,
      sources: {
        raster: {
          type: "raster",
          tiles: ["https://tiles.example/{z}/{x}/{y}.png"],
          tileSize: 512,
          attribution: "Example"
        }
      },
      layers: [{id: "raster", type: "raster", source: "raster"}]
    });
  });

  it("loads and preserves a valid local MapLibre style using the supplied signal", async () => {
    const style = {version: 8, sources: {local: {type: "vector"}}, layers: []};
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(style)
    } as unknown as Response);

    const result = await resolveBasemap(
      {mode: "local", localStyleUrl: "https://maps.example/style.json"},
      controller.signal,
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith("https://maps.example/style.json", {signal: controller.signal});
    expect(result).toMatchObject({provider: "local", primaryLabel: "本地地图", secondaryLabel: "公共备用"});
    expect(result.mapStyles?.[0].style).toBe(style);
    expect(result.mapStyles?.[1].style.sources.raster.attribution).toBe(OSM_ATTRIBUTION);
  });

  it("reports local style HTTP and JSON failures precisely", async () => {
    const url = "https://maps.example/style.json";
    await expect(
      resolveBasemap({mode: "local", localStyleUrl: url}, undefined, vi.fn().mockResolvedValue(new Response("down", {status: 503})))
    ).rejects.toThrow(`${url}（HTTP 503）`);
    await expect(
      resolveBasemap({mode: "local", localStyleUrl: url}, undefined, vi.fn().mockResolvedValue(new Response("not json")))
    ).rejects.toThrow("JSON");
  });

  it("rejects a local style with no sources property", async () => {
    await expectLocalStyleInvalid({version: 8, layers: []}, "sources");
  });

  it("rejects a local style with no layers property", async () => {
    await expectLocalStyleInvalid({version: 8, sources: {}}, "layers");
  });

  it("rejects a local style with no version property", async () => {
    await expectLocalStyleInvalid({sources: {}, layers: []}, "version");
  });

  it("rejects a local style with an incorrect version", async () => {
    await expectLocalStyleInvalid({version: 7, sources: {}, layers: []}, "version");
  });

  it("preserves AbortError when style loading is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn().mockRejectedValue(abortError());

    await expect(
      resolveBasemap({mode: "local", localStyleUrl: "https://maps.example/style.json"}, controller.signal, fetcher)
    ).rejects.toMatchObject({name: "AbortError"});
  });
});

async function expectLocalStyleInvalid(value: unknown, message: string): Promise<void> {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)));
  await expect(
    resolveBasemap({mode: "local", localStyleUrl: "https://maps.example/style.json"}, undefined, fetcher)
  ).rejects.toThrow(message);
}
