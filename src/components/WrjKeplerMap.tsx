import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {CaseBundleV2} from "../features/cases/caseBundle";
import type {
  DynamicOverlayOptions
} from "../features/dynamic-replanning/dynamicDeckLayers";
import type {
  MissionLayerPreferencesV3,
  VerticalScale
} from "../features/mission/missionLayerPreferences";
import {useContainerSize} from "../hooks/useContainerSize";
import {WRJ_MAP_ID} from "../kepler/constants";
import {useEffect, useMemo} from "react";
import {
  MissionOverlayContext,
  WrjKeplerGl
} from "./kepler/UavMapContainer";

export interface WrjKeplerMapProps {
  basemap: ResolvedBasemap;
  bundle?: CaseBundleV2 | null;
  missionTimeSec?: number;
  verticalScale?: VerticalScale;
  preferences?: MissionLayerPreferencesV3 | null;
  dynamicOverlay?: DynamicOverlayOptions | null;
  onSelectSortie?: (assignmentId: string) => void;
  onMapInteraction?: () => void;
  onMapReady?: () => void;
}

export function WrjKeplerMap({
  basemap,
  bundle = null,
  missionTimeSec = 0,
  verticalScale = 1,
  preferences = null,
  dynamicOverlay = null,
  onSelectSortie,
  onMapInteraction,
  onMapReady
}: WrjKeplerMapProps) {
  const {ref, width, height} = useContainerSize<HTMLDivElement>();
  const mapReady = width > 0 && height > 0;
  const overlay = useMemo(
    () => ({
      bundle,
      missionTimeSec,
      verticalScale,
      preferences,
      dynamic: dynamicOverlay,
      onSelectSortie
    }),
    [
      bundle,
      missionTimeSec,
      verticalScale,
      preferences,
      dynamicOverlay,
      onSelectSortie
    ]
  );

  useEffect(() => {
    if (mapReady) onMapReady?.();
  }, [mapReady, onMapReady]);

  return (
    <div
      ref={ref}
      className="wrj-map-container"
      data-testid="map-container"
      onPointerDown={onMapInteraction}
      onWheel={onMapInteraction}
    >
      {mapReady ? (
        <MissionOverlayContext.Provider value={overlay}>
          <WrjKeplerGl
            id={WRJ_MAP_ID}
            mapboxApiAccessToken={basemap.mapboxToken}
            mapStyles={basemap.mapStyles}
            mapStylesReplaceDefault={basemap.mapStylesReplaceDefault}
            width={width}
            height={height}
          />
        </MissionOverlayContext.Provider>
      ) : (
        <div className="map-measuring" aria-label="正在测量地图容器" />
      )}
    </div>
  );
}
