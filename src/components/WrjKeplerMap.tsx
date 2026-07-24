import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {CaseBundleV2} from "../features/cases/caseBundle";
import type {
  MissionLayerPreferencesV2,
  VerticalScale
} from "../features/mission/missionLayerPreferences";
import {useContainerSize} from "../hooks/useContainerSize";
import {WRJ_MAP_ID} from "../kepler/constants";
import {useMemo} from "react";
import {
  MissionOverlayContext,
  WrjKeplerGl
} from "./kepler/UavMapContainer";

export interface WrjKeplerMapProps {
  basemap: ResolvedBasemap;
  bundle?: CaseBundleV2 | null;
  missionTimeSec?: number;
  verticalScale?: VerticalScale;
  preferences?: MissionLayerPreferencesV2 | null;
  onSelectSortie?: (assignmentId: string) => void;
}

export function WrjKeplerMap({
  basemap,
  bundle = null,
  missionTimeSec = 0,
  verticalScale = 1,
  preferences = null,
  onSelectSortie
}: WrjKeplerMapProps) {
  const {ref, width, height} = useContainerSize<HTMLDivElement>();
  const overlay = useMemo(
    () => ({
      bundle,
      missionTimeSec,
      verticalScale,
      preferences,
      onSelectSortie
    }),
    [bundle, missionTimeSec, verticalScale, preferences, onSelectSortie]
  );

  return (
    <div ref={ref} className="wrj-map-container" data-testid="map-container">
      {width > 0 && height > 0 ? (
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
