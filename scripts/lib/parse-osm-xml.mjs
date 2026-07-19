import {JSDOM} from "jsdom";

function tagsOf(element) {
  return Object.fromEntries(
    [...element.querySelectorAll(":scope > tag")].map((tag) => [
      tag.getAttribute("k"),
      tag.getAttribute("v")
    ])
  );
}

export function parseOsmXml(xml) {
  const document = new JSDOM(xml, {contentType: "text/xml"}).window.document;
  const nodes = [...document.querySelectorAll("osm > node")].map((node) => ({
    type: "node",
    id: Number(node.getAttribute("id")),
    lat: Number(node.getAttribute("lat")),
    lon: Number(node.getAttribute("lon")),
    tags: tagsOf(node)
  }));
  const nodesById = new Map(nodes.map((node) => [String(node.id), node]));

  const ways = [...document.querySelectorAll("osm > way")]
    .map((way) => {
      const geometry = [...way.querySelectorAll(":scope > nd")]
        .map((nodeReference) => nodesById.get(nodeReference.getAttribute("ref")))
        .filter(Boolean)
        .map(({lat, lon}) => ({lat, lon}));
      if (geometry.length === 0) return null;
      const center = geometry.reduce(
        (value, point) => ({lat: value.lat + point.lat, lon: value.lon + point.lon}),
        {lat: 0, lon: 0}
      );
      return {
        type: "way",
        id: Number(way.getAttribute("id")),
        center: {
          lat: center.lat / geometry.length,
          lon: center.lon / geometry.length
        },
        geometry,
        tags: tagsOf(way)
      };
    })
    .filter(Boolean);

  return {elements: [...nodes, ...ways]};
}
