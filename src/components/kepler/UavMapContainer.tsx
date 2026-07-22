import {
  MapContainerFactory,
  injectComponents,
  type MapContainerProps
} from "@kepler.gl/components";
import {createContext, useContext} from "react";
import type {UavFlightPath} from "../../features/flight/flightPaths";
import {
  createUavDeckLayers,
  type CreateUavDeckLayersOptions
} from "../../features/flight/uavDeckLayers";
import {UAV_COLORS} from "../../kepler/constants";

export interface FlightOverlayValue {
  paths: readonly UavFlightPath[];
  iconSize: number;
}

// eslint-disable-next-line react-refresh/only-export-components
export const FlightOverlayContext = createContext<FlightOverlayValue>({paths: [], iconSize: 32});

type DeckRenderCallbacks = NonNullable<MapContainerProps["deckRenderCallbacks"]>;

interface TripLayerShape {
  id?: unknown;
  config?: {
    isVisible?: unknown;
    visConfig?: {
      colorRange?: {
        colors?: unknown;
      };
    };
  };
}

const DEFAULT_PALETTE = [
  UAV_COLORS["UAV-01"],
  UAV_COLORS["UAV-02"],
  UAV_COLORS["UAV-03"]
] as const;

function validPaletteColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getUavDeckLayerOptions(
  props: Pick<MapContainerProps, "visState">,
  overlay: FlightOverlayValue
): CreateUavDeckLayersOptions {
  const visState = props.visState;
  const layers = visState.layers as unknown as readonly TripLayerShape[];
  const tripLayer = layers.find(({id}) => id === "wrj-trip-layer");
  const rawColors = tripLayer?.config?.visConfig?.colorRange?.colors;
  const colors = Array.isArray(rawColors) ? rawColors : [];
  const rawTime: unknown = visState.animationConfig.currentTime;

  return {
    paths: overlay.paths,
    iconSize: overlay.iconSize,
    time: typeof rawTime === "number" && Number.isFinite(rawTime) ? rawTime : null,
    visible: tripLayer?.config?.isVisible === true,
    palette: DEFAULT_PALETTE.map((fallback, index) => validPaletteColor(colors[index], fallback))
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function mergeDeckRenderCallbacks(
  callbacks: MapContainerProps["deckRenderCallbacks"],
  layerOptions: CreateUavDeckLayersOptions
): DeckRenderCallbacks {
  return {
    ...callbacks,
    onDeckRender: (deckProps) => {
      const renderedProps = callbacks?.onDeckRender
        ? callbacks.onDeckRender(deckProps)
        : deckProps;
      if (renderedProps === null) return null;

      const layers = Array.isArray(renderedProps.layers) ? renderedProps.layers : [];
      return {
        ...renderedProps,
        layers: [...layers, ...createUavDeckLayers(layerOptions)]
      };
    }
  };
}

export function UavMapContainerFactory(...dependencies: Parameters<typeof MapContainerFactory>) {
  const MapContainer = MapContainerFactory(...dependencies);

  function UavMapContainer(props: MapContainerProps) {
    const overlay = useContext(FlightOverlayContext);
    const deckRenderCallbacks = mergeDeckRenderCallbacks(
      props.deckRenderCallbacks,
      getUavDeckLayerOptions(props, overlay)
    );

    return <MapContainer {...props} deckRenderCallbacks={deckRenderCallbacks} />;
  }

  return UavMapContainer;
}

UavMapContainerFactory.deps = MapContainerFactory.deps;

export const WrjKeplerGl = injectComponents([
  [MapContainerFactory, UavMapContainerFactory]
] as never[]);
