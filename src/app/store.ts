import {applyMiddleware, combineReducers, compose, createStore, type Reducer} from "redux";
import keplerGlReducer, {
  enhanceReduxMiddleware,
  type KeplerGlState
} from "@kepler.gl/reducers";

type KeplerStateMap = Record<string, KeplerGlState>;

function createKeplerReducer(debugMode: boolean) {
  return keplerGlReducer.initialState({
    uiState: {
      readOnly: !debugMode,
      currentModal: null,
      mapControls: {
        visibleLayers: {show: debugMode, active: false},
        mapLegend: {show: true, active: true},
        toggle3d: {show: true},
        splitMap: {show: false}
      }
    }
  });
}

export function createAppStore(debugMode: boolean) {
  const typedKeplerReducer = createKeplerReducer(debugMode) as Reducer<KeplerStateMap>;
  const rootReducer = combineReducers({keplerGl: typedKeplerReducer});
  const middlewares = enhanceReduxMiddleware([]);
  return createStore(rootReducer, {}, compose(applyMiddleware(...middlewares)));
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
