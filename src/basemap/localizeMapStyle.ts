import type {MapStyleLayer, MapStyleV8} from "./basemapConfig";

export const CHINESE_NAME_EXPRESSION = [
  "coalesce",
  ["get", "name:zh"],
  ["get", "name"],
  ["get", "name_en"]
] as const;

const NAME_TOKENS = new Set([
  "{name}",
  "{name_en}",
  "{name:latin}",
  "{name:nonlatin}"
]);

export function localizeMapStyle(style: MapStyleV8): MapStyleV8 {
  return {
    ...style,
    layers: style.layers.map(localizeLayer)
  };
}

function localizeLayer(layer: MapStyleLayer): MapStyleLayer {
  if (layer.type !== "symbol" || !isRecord(layer.layout)) return layer;
  const textField = layer.layout["text-field"];
  if (!isNameTextField(textField)) return layer;
  return {
    ...layer,
    layout: {
      ...layer.layout,
      "text-field": CHINESE_NAME_EXPRESSION
    }
  };
}

function isNameTextField(value: unknown): boolean {
  if (typeof value === "string") return NAME_TOKENS.has(value);
  if (Array.isArray(value)) {
    return (
      value.length === 2
      && value[0] === "get"
      && typeof value[1] === "string"
      && ["name", "name_en", "name:latin", "name:nonlatin"].includes(value[1])
    );
  }
  if (!isRecord(value) || !Array.isArray(value.stops) || value.stops.length === 0) {
    return false;
  }
  return value.stops.every(stop => (
    Array.isArray(stop)
    && stop.length >= 2
    && typeof stop[1] === "string"
    && NAME_TOKENS.has(stop[1])
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
