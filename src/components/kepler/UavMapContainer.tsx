import {
  MapContainerFactory,
  injectComponents,
  type MapContainerProps
} from "@kepler.gl/components";
import {createContext, useContext, useMemo} from "react";
import type {CaseBundleV2} from "../../features/cases/caseBundle";
import {
  createDynamicDeckLayers,
  type DynamicOverlayOptions
} from "../../features/dynamic-replanning/dynamicDeckLayers";
import {
  createMissionDeckLayers
} from "../../features/mission/missionDeckLayers";
import type {
  MissionLayerPreferencesV3,
  VerticalScale
} from "../../features/mission/missionLayerPreferences";

export interface MissionOverlayValue {
  bundle: CaseBundleV2 | null;
  missionTimeSec: number;
  verticalScale: VerticalScale;
  preferences: MissionLayerPreferencesV3 | null;
  dynamic: DynamicOverlayOptions | null;
  onSelectSortie?: (assignmentId: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const MissionOverlayContext = createContext<MissionOverlayValue>({
  bundle: null,
  missionTimeSec: 0,
  verticalScale: 1,
  preferences: null,
  dynamic: null
});

type DeckRenderCallbacks = NonNullable<MapContainerProps["deckRenderCallbacks"]>;
type MissionDeckLayers =
  | ReturnType<typeof createMissionDeckLayers>
  | ReturnType<typeof createDynamicDeckLayers>;

// eslint-disable-next-line react-refresh/only-export-components
export function createMissionOverlayLayers(
  overlay: MissionOverlayValue
): MissionDeckLayers {
  if (overlay.bundle !== null && overlay.dynamic !== null) {
    throw new Error("cannot render both static and dynamic mission overlays");
  }
  if (overlay.dynamic !== null) {
    return createDynamicDeckLayers(overlay.dynamic);
  }
  if (overlay.bundle === null || overlay.preferences === null) return [];
  return createMissionDeckLayers({
    bundle: overlay.bundle,
    missionTimeSec: overlay.missionTimeSec,
    verticalScale: overlay.verticalScale,
    preferences: overlay.preferences,
    onSelectSortie: overlay.onSelectSortie
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function mergeDeckRenderCallbacks(
  callbacks: MapContainerProps["deckRenderCallbacks"],
  missionLayers: MissionDeckLayers
): DeckRenderCallbacks {
  return {
    ...callbacks,
    onDeckRender: (deckProps) => {
      const renderedProps = callbacks?.onDeckRender
        ? callbacks.onDeckRender(deckProps)
        : deckProps;
      if (renderedProps === null) return null;

      const layers = Array.isArray(renderedProps.layers) ? renderedProps.layers : [];
      const missionLayerIds = new Set(missionLayers.map(deckLayerId));
      return {
        ...renderedProps,
        layers: [
          ...layers.filter(layer => !missionLayerIds.has(deckLayerId(layer))),
          ...missionLayers
        ]
      };
    }
  };
}

function deckLayerId(layer: unknown): unknown {
  return typeof layer === "object" && layer !== null && "id" in layer
    ? layer.id
    : undefined;
}

export function UavMapContainerFactory(...dependencies: Parameters<typeof MapContainerFactory>) {
  const MapContainer = MapContainerFactory(...dependencies);

  function UavMapContainer(props: MapContainerProps) {
    const overlay = useContext(MissionOverlayContext);
    const missionLayers = useMemo(
      () => createMissionOverlayLayers(overlay),
      [overlay]
    );
    const deckRenderCallbacks = useMemo(
      () => mergeDeckRenderCallbacks(props.deckRenderCallbacks, missionLayers),
      [props.deckRenderCallbacks, missionLayers]
    );

    return <MapContainer {...props} deckRenderCallbacks={deckRenderCallbacks} />;
  }

  return UavMapContainer;
}

UavMapContainerFactory.deps = MapContainerFactory.deps;

export const WrjKeplerGl = injectComponents([
  [MapContainerFactory, UavMapContainerFactory]
] as never[]);
