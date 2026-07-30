// @vitest-environment node
import {describe, expect, it} from "vitest";
import type {MapStyleV8} from "../src/basemap/basemapConfig";
import {
  CHINESE_NAME_EXPRESSION,
  localizeMapStyle
} from "../src/basemap/localizeMapStyle";

function styleWithTextFields(...textFields: unknown[]): MapStyleV8 {
  return {
    version: 8,
    sources: {carto: {type: "vector"}},
    layers: textFields.map((textField, index) => ({
      id: `label-${index}`,
      type: "symbol",
      source: "carto",
      layout: {"text-field": textField}
    }))
  };
}

describe("localizeMapStyle", () => {
  it("localizes legacy name tokens and zoom-stop name functions", () => {
    const localized = localizeMapStyle(styleWithTextFields(
      "{name_en}",
      {stops: [[8, "{name_en}"], [13, "{name}"]]}
    ));

    expect(localized.layers[0].layout).toMatchObject({
      "text-field": CHINESE_NAME_EXPRESSION
    });
    expect(localized.layers[1].layout).toMatchObject({
      "text-field": CHINESE_NAME_EXPRESSION
    });
  });

  it("localizes name getter expressions without touching refs or house numbers", () => {
    const localized = localizeMapStyle(styleWithTextFields(
      ["get", "name_en"],
      "{ref}",
      "{housenumber}"
    ));

    expect(localized.layers[0].layout).toMatchObject({
      "text-field": CHINESE_NAME_EXPRESSION
    });
    expect(localized.layers[1].layout).toMatchObject({"text-field": "{ref}"});
    expect(localized.layers[2].layout).toMatchObject({"text-field": "{housenumber}"});
  });

  it("returns a new style without mutating the supplied style", () => {
    const source = styleWithTextFields("{name_en}");
    const localized = localizeMapStyle(source);

    expect(localized).not.toBe(source);
    expect(localized.layers).not.toBe(source.layers);
    expect(source.layers[0].layout).toMatchObject({"text-field": "{name_en}"});
  });
});
