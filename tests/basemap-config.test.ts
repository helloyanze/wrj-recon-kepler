// @vitest-environment node
import {describe, expect, it, vi} from "vitest";
import {
  createRasterStyle,
  resolveBasemap
} from "../src/basemap/basemapConfig";
import {CHINESE_NAME_EXPRESSION} from "../src/basemap/localizeMapStyle";

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const CARTO_ATTRIBUTION = "© OpenStreetMap contributors · © CARTO";

function vectorStyle(name: string) {
  return {
    version: 8,
    name,
    sources: {carto: {type: "vector"}},
    layers: [
      {
        id: "place-label",
        type: "symbol",
        source: "carto",
        layout: {"text-field": "{name_en}"}
      },
      {
        id: "road-ref",
        type: "symbol",
        source: "carto",
        layout: {"text-field": "{ref}"}
      }
    ]
  };
}

function publicStyleFetcher() {
  return vi.fn(async (url: string) => new Response(JSON.stringify(
    vectorStyle(url.includes("dark-matter") ? "Dark Matter" : "Positron")
  )));
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

describe("resolveBasemap", () => {
  it("loads public vector basemaps and localizes name labels by default", async () => {
    const fetcher = publicStyleFetcher();
    const result = await resolveBasemap({}, undefined, fetcher);

    expect(result).toMatchObject({
      provider: "public",
      mapStylesReplaceDefault: true,
      primaryLabel: "深色地图",
      secondaryLabel: "亮色地图",
      statusLabel: "公共底图"
    });
    expect(result.mapboxToken).toBe("");
    expect(result.mapStyles?.map(({id}) => id)).toEqual(["satellite", "light"]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    ]);
    expect(result.mapStyles?.[0].style.sources.carto.type).toBe("vector");
    expect(result.mapStyles?.[0].style.layers[0]).toMatchObject({
      layout: {
        "text-field": [
          "coalesce",
          ["get", "name:zh"],
          ["get", "name"],
          ["get", "name_en"]
        ]
      }
    });
    expect(result.mapStyles?.[0].style.layers[1]).toMatchObject({
      layout: {"text-field": "{ref}"}
    });
  });

  it("reports a public vector style HTTP failure as a configuration error", async () => {
    const fetcher = vi.fn(async (url: string) => (
      url.includes("dark-matter")
        ? new Response("down", {status: 503})
        : new Response(JSON.stringify(vectorStyle("Positron")))
    ));

    await expect(resolveBasemap({mode: "public"}, undefined, fetcher))
      .rejects.toThrow(/底图配置错误：.*HTTP 503/);
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
      }, undefined, publicStyleFetcher())
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

  it("creates public dark and light vector styles with Carto attribution", async () => {
    const result = await resolveBasemap(
      {mode: "public"},
      undefined,
      publicStyleFetcher()
    );
    const [satellite, light] = result.mapStyles!;

    expect(satellite).toMatchObject({id: "satellite", style: {version: 8}});
    expect(satellite.style.sources.carto.type).toBe("vector");
    expect(light.style.sources.carto.type).toBe("vector");
    expect(result.attributionByStyle).toEqual({
      satellite: CARTO_ATTRIBUTION,
      light: CARTO_ATTRIBUTION
    });
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

  it("isolates raster inputs and fetched public styles between resolutions", async () => {
    const tiles = ["https://tiles.example/{z}/{x}/{y}.png"];
    const style = createRasterStyle(tiles, "Example");
    tiles.push("https://mutated.example/{z}/{x}/{y}.png");
    expect(style.sources.raster.tiles).toEqual(["https://tiles.example/{z}/{x}/{y}.png"]);

    const first = await resolveBasemap({mode: "public"}, undefined, publicStyleFetcher());
    first.mapStyles![0].style.layers[0].id = "mutated";
    const second = await resolveBasemap({mode: "public"}, undefined, publicStyleFetcher());
    expect(second.mapStyles![0].style.layers[0].id).toBe("place-label");
  });

  it("loads and localizes a valid local MapLibre style using the supplied signal", async () => {
    const style = {
      version: 8,
      sources: {local: {type: "vector"}},
      layers: [{
        id: "local-name",
        type: "symbol",
        source: "local",
        layout: {"text-field": "{name_en}"}
      }]
    };
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
    expect(result.mapStyles?.[0].style).not.toBe(style);
    expect(result.mapStyles?.[0].style.layers[0]).toMatchObject({
      layout: {"text-field": CHINESE_NAME_EXPRESSION}
    });
    expect(style.layers[0].layout["text-field"]).toBe("{name_en}");
    expect(result.mapStyles?.[1].style.sources.raster.attribution).toBe(OSM_ATTRIBUTION);
    expect(result.attributionByStyle).toEqual({
      satellite: "本地地图数据 · © OpenStreetMap contributors",
      light: OSM_ATTRIBUTION
    });
  });

  it("provides accurate attribution for both Mapbox style choices", async () => {
    const result = await resolveBasemap({mode: "mapbox", mapboxToken: "token"});

    expect(result.attributionByStyle).toEqual({
      satellite: "© Mapbox © OpenStreetMap contributors",
      light: "© Mapbox © OpenStreetMap contributors"
    });
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

  it("rejects null entries in local style sources and layers", async () => {
    await expectLocalStyleInvalid({version: 8, sources: {bad: null}, layers: []}, "sources.bad");
    await expectLocalStyleInvalid({version: 8, sources: {}, layers: [null]}, "layers[0]");
  });

  it("rejects local style layers with missing or empty id and type", async () => {
    await expectLocalStyleInvalid({version: 8, sources: {}, layers: [{type: "fill"}]}, "layers[0].id");
    await expectLocalStyleInvalid({version: 8, sources: {}, layers: [{id: "", type: "fill"}]}, "layers[0].id");
    await expectLocalStyleInvalid({version: 8, sources: {}, layers: [{id: "a"}]}, "layers[0].type");
    await expectLocalStyleInvalid({version: 8, sources: {}, layers: [{id: "a", type: ""}]}, "layers[0].type");
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
