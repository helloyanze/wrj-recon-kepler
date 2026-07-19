import KeplerGl from "@kepler.gl/components";
import {useContainerSize} from "../hooks/useContainerSize";
import {WRJ_MAP_ID} from "../kepler/constants";

export interface WrjKeplerMapProps {
  mapboxToken: string;
}

export function WrjKeplerMap({mapboxToken}: WrjKeplerMapProps) {
  const {ref, width, height} = useContainerSize<HTMLDivElement>();

  return (
    <div ref={ref} className="wrj-map-container" data-testid="map-container">
      {width > 0 && height > 0 ? (
        <KeplerGl
          id={WRJ_MAP_ID}
          mapboxApiAccessToken={mapboxToken}
          width={width}
          height={height}
        />
      ) : (
        <div className="map-measuring" aria-label="正在测量地图容器" />
      )}
    </div>
  );
}
