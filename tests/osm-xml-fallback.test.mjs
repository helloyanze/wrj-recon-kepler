import {describe, expect, it} from "vitest";
import {parseOsmXml} from "../scripts/lib/parse-osm-xml.mjs";

describe("parseOsmXml", () => {
  it("converts OSM nodes and ways into Overpass-compatible elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <osm version="0.6">
        <node id="1" lat="18.6200" lon="110.2000"><tag k="name" v="真实点"/></node>
        <node id="2" lat="18.6210" lon="110.2010" />
        <way id="9">
          <nd ref="1"/><nd ref="2"/>
          <tag k="highway" v="secondary"/>
        </way>
      </osm>`;

    expect(parseOsmXml(xml)).toEqual({
      elements: [
        {type: "node", id: 1, lat: 18.62, lon: 110.2, tags: {name: "真实点"}},
        {type: "node", id: 2, lat: 18.621, lon: 110.201, tags: {}},
        {
          type: "way",
          id: 9,
          center: {lat: 18.6205, lon: 110.2005},
          geometry: [
            {lat: 18.62, lon: 110.2},
            {lat: 18.621, lon: 110.201}
          ],
          tags: {highway: "secondary"}
        }
      ]
    });
  });
});
