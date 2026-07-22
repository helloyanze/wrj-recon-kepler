import type {ResolvedBasemap} from "../basemap/basemapConfig";
import type {UavFlightPath} from "../features/flight/flightPaths";
import {useContainerSize} from "../hooks/useContainerSize";
import {WRJ_MAP_ID} from "../kepler/constants";
import {FlightOverlayContext, WrjKeplerGl} from "./kepler/UavMapContainer";

export interface WrjKeplerMapProps {
  basemap: ResolvedBasemap;
  flightPaths?: readonly UavFlightPath[];
  uavIconSize?: number;
}

export function WrjKeplerMap({
  basemap,
  flightPaths = [],
  uavIconSize = 32
}: WrjKeplerMapProps) {
  const {ref, width, height} = useContainerSize<HTMLDivElement>();

  return (
    <div ref={ref} className="wrj-map-container" data-testid="map-container">
      {width > 0 && height > 0 ? (
        <FlightOverlayContext.Provider value={{paths: flightPaths, iconSize: uavIconSize}}>
          <WrjKeplerGl
            id={WRJ_MAP_ID}
            mapboxApiAccessToken={basemap.mapboxToken}
            mapStyles={basemap.mapStyles}
            mapStylesReplaceDefault={basemap.mapStylesReplaceDefault}
            width={width}
            height={height}
          />
        </FlightOverlayContext.Provider>
      ) : (
        <div className="map-measuring" aria-label="正在测量地图容器" />
      )}
    </div>
  );
}
