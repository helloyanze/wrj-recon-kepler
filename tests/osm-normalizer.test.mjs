import {describe, expect, it} from "vitest";
import {normalizeOverpassData} from "../scripts/lib/normalize-osm-features.mjs";

const BBOX = {south: 18.6, west: 110.18, north: 18.66, east: 110.27};

describe("normalizeOverpassData", () => {
  it("preserves OSM identity for point and context features", () => {
    const result = normalizeOverpassData(
      {
        elements: [
          {
            type: "node",
            id: 101,
            lat: 18.625,
            lon: 110.205,
            tags: {name: "日月湾海门游览区", tourism: "attraction"}
          },
          {
            type: "way",
            id: 202,
            center: {lat: 18.626, lon: 110.207},
            geometry: [
              {lat: 18.625, lon: 110.206},
              {lat: 18.626, lon: 110.207},
              {lat: 18.627, lon: 110.208}
            ],
            tags: {name: "滨海道路", highway: "secondary"}
          }
        ]
      },
      "2026-07-19T00:00:00.000Z",
      BBOX
    );

    expect(result.pois.features).toHaveLength(2);
    expect(result.pois.features[0].properties).toMatchObject({
      dataNature: "REAL_PUBLIC_GEODATA",
      sourceName: "OpenStreetMap",
      sourceRef: "node/101",
      geometryOrigin: "original"
    });
    expect(result.context.features).toHaveLength(1);
    expect(result.context.features[0]).toMatchObject({
      geometry: {type: "LineString"},
      properties: {sourceRef: "way/202"}
    });
  });

  it("drops objects without usable coordinates", () => {
    const result = normalizeOverpassData(
      {elements: [{type: "relation", id: 303, tags: {name: "无坐标对象"}}]},
      "2026-07-19T00:00:00.000Z",
      BBOX
    );
    expect(result.pois.features).toHaveLength(0);
    expect(result.context.features).toHaveLength(0);
  });

  it("rejects untagged and out-of-bounds fallback map features", () => {
    const result = normalizeOverpassData(
      {
        elements: [
          {type: "node", id: 401, lat: 19.0859, lon: 110.6065, tags: {name: "边界外", tourism: "attraction"}},
          {
            type: "way",
            id: 402,
            geometry: [{lat: 18.62, lon: 110.2}, {lat: 18.621, lon: 110.201}],
            tags: {}
          },
          {
            type: "way",
            id: 403,
            geometry: [{lat: 18.62, lon: 110.2}, {lat: 18.7, lon: 110.3}],
            tags: {highway: "secondary"}
          }
        ]
      },
      "2026-07-19T00:00:00.000Z",
      BBOX
    );

    expect(result.pois.features).toHaveLength(0);
    expect(result.context.features).toHaveLength(0);
  });
});
