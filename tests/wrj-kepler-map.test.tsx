import {cleanup, render, screen} from "@testing-library/react";
import {useContext, type Context} from "react";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {ResolvedBasemap} from "../src/basemap/basemapConfig";
import {
  MissionOverlayContext,
  createMissionOverlayLayers,
  mergeDeckRenderCallbacks
} from "../src/components/kepler/UavMapContainer";
import {WrjKeplerMap} from "../src/components/WrjKeplerMap";
import {convertMissionPlan} from "../src/features/cases/convertMissionPlan";
import type {CaseBundleV2} from "../src/features/cases/caseBundle";
import type {
  DynamicOverlayOptions
} from "../src/features/dynamic-replanning/dynamicDeckLayers";
import {
  createDefaultMissionLayerPreferences,
  type MissionLayerPreferencesV3
} from "../src/features/mission/missionLayerPreferences";
import {missionPlanFixture} from "./fixtures/missionPlanFixture";

interface OverlayValue {
  bundle: CaseBundleV2 | null;
  missionTimeSec: number;
  verticalScale: 1 | 2 | 4;
  preferences: MissionLayerPreferencesV3 | null;
  dynamic: DynamicOverlayOptions | null;
  onSelectSortie?: (assignmentId: string) => void;
}

const runtime = vi.hoisted(() => ({
  keplerProps: [] as Array<Record<string, unknown>>,
  overlayContext: undefined as Context<OverlayValue> | undefined
}));

vi.mock("@kepler.gl/components", () => ({
  MapContainerFactory: Object.assign(vi.fn(), {deps: [vi.fn(), vi.fn(), vi.fn()]}),
  injectComponents: vi.fn(() => (props: Record<string, unknown>) => {
    if (!runtime.overlayContext) throw new Error("overlay context was not initialized");
    const overlay = useContext(runtime.overlayContext);
    runtime.keplerProps.push(props);
    return (
      <div
        data-testid="kepler-gl"
        data-case-id={overlay.bundle?.case.caseId ?? ""}
        data-mission-time={overlay.missionTimeSec}
        data-vertical-scale={overlay.verticalScale}
        data-has-preferences={overlay.preferences !== null}
        data-has-selection={overlay.onSelectSortie !== undefined}
      />
    );
  })
}));

runtime.overlayContext = MissionOverlayContext;

vi.mock("../src/hooks/useContainerSize", () => ({
  useContainerSize: () => ({ref: vi.fn(), width: 960, height: 640})
}));

const PUBLIC_BASEMAP: ResolvedBasemap = {
  provider: "public",
  mapboxToken: "",
  mapStyles: [
    {id: "satellite", style: {version: 8, sources: {}, layers: []}},
    {id: "light", style: {version: 8, sources: {}, layers: []}}
  ],
  mapStylesReplaceDefault: true,
  primaryLabel: "公共地图",
  secondaryLabel: "OSM 简洁图",
  statusLabel: "公共底图",
  attributionByStyle: {
    satellite: "© OpenStreetMap contributors · © CARTO",
    light: "© OpenStreetMap contributors"
  }
};

const MAPBOX_BASEMAP: ResolvedBasemap = {
  provider: "mapbox",
  mapboxToken: "pk.test-token",
  mapStylesReplaceDefault: false,
  primaryLabel: "卫星地图",
  secondaryLabel: "简洁地图",
  statusLabel: "Mapbox 已配置",
  attributionByStyle: {
    satellite: "© Mapbox © OpenStreetMap contributors",
    light: "© Mapbox © OpenStreetMap contributors"
  }
};

const bundle = convertMissionPlan({
  missionPlan: missionPlanFixture,
  sourceName: "fixture",
  sourceRun: "20260721T192032",
  importedAt: "2026-07-21T19:20:32.000Z",
  sha256: "a".repeat(64)
});
const preferences = createDefaultMissionLayerPreferences(
  bundle.case.caseId,
  bundle.case.planId,
  bundle.assignments.map(({uavId}) => uavId),
  bundle.strips
);

afterEach(() => {
  cleanup();
  runtime.keplerProps.length = 0;
});

describe("WrjKeplerMap", () => {
  it("passes public vector styles to the fixed Kepler map instance", () => {
    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} />);

    expect(runtime.keplerProps).toHaveLength(1);
    expect(runtime.keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "",
      mapStylesReplaceDefault: true,
      width: 960,
      height: 640
    });
    expect((runtime.keplerProps[0].mapStyles as Array<{id: string}>).map(({id}) => id)).toEqual([
      "satellite",
      "light"
    ]);
  });

  it("keeps Mapbox defaults when the provider has no custom styles", () => {
    render(<WrjKeplerMap basemap={MAPBOX_BASEMAP} />);

    expect(runtime.keplerProps[0]).toMatchObject({
      id: "wrj-map",
      mapboxApiAccessToken: "pk.test-token",
      mapStylesReplaceDefault: false
    });
    expect(runtime.keplerProps[0].mapStyles).toBeUndefined();
  });

  it("provides an inactive mission overlay by default", () => {
    render(<WrjKeplerMap basemap={PUBLIC_BASEMAP} />);

    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-case-id", "");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-mission-time", "0");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-vertical-scale", "1");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-has-preferences", "false");
  });

  it("provides the complete synchronized mission overlay value", () => {
    const onSelectSortie = vi.fn();
    render(
      <WrjKeplerMap
        basemap={PUBLIC_BASEMAP}
        bundle={bundle}
        missionTimeSec={17.5}
        verticalScale={4}
        preferences={preferences}
        onSelectSortie={onSelectSortie}
      />
    );

    expect(screen.getByTestId("kepler-gl")).toHaveAttribute(
      "data-case-id",
      bundle.case.caseId
    );
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-mission-time", "17.5");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-vertical-scale", "4");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-has-preferences", "true");
    expect(screen.getByTestId("kepler-gl")).toHaveAttribute("data-has-selection", "true");
  });
});

describe("mergeDeckRenderCallbacks", () => {
  it("preserves callbacks and appends the six mission layers exactly once", () => {
    const onDeckLoad = vi.fn();
    const onDeckAfterRender = vi.fn();
    const originalLayer = {id: "original"};
    const missionLayers = createMissionOverlayLayers({
      bundle,
      missionTimeSec: 5,
      verticalScale: 2,
      preferences,
      dynamic: null
    });
    expect(missionLayers).toHaveLength(6);
    const callbacks = mergeDeckRenderCallbacks(
      {
        onDeckLoad,
        onDeckAfterRender,
        onDeckRender: vi.fn(() => ({layers: [originalLayer], marker: "kept"}))
      },
      missionLayers
    );

    const result = callbacks.onDeckRender?.({layers: [{id: "before-original"}]});
    expect(callbacks.onDeckLoad).toBe(onDeckLoad);
    expect(callbacks.onDeckAfterRender).toBe(onDeckAfterRender);
    expect(result).toMatchObject({marker: "kept"});
    expect((result?.layers as Array<{id: string}>).map(({id}) => id)).toEqual([
      "original",
      "wrj-algorithm-region",
      "wrj-algorithm-scanned",
      "wrj-algorithm-strips",
      "wrj-algorithm-routes",
      "wrj-algorithm-trips",
      "wrj-algorithm-uav-triangles"
    ]);
  });

  it("does not create mission layers without both a bundle and preferences", () => {
    expect(createMissionOverlayLayers({
      bundle: null,
      missionTimeSec: 0,
      verticalScale: 1,
      preferences,
      dynamic: null
    })).toEqual([]);
    expect(createMissionOverlayLayers({
      bundle,
      missionTimeSec: 0,
      verticalScale: 1,
      preferences: null,
      dynamic: null
    })).toEqual([]);
  });

  it("does not duplicate mission layers already returned by Kepler", () => {
    const missionLayers = createMissionOverlayLayers({
      bundle,
      missionTimeSec: 5,
      verticalScale: 1,
      preferences,
      dynamic: null
    });
    const callbacks = mergeDeckRenderCallbacks(
      {onDeckRender: () => ({layers: [{id: "kepler"}, missionLayers[0]]})},
      missionLayers
    );

    const result = callbacks.onDeckRender?.({layers: []});
    expect((result?.layers as Array<{id: string}>).map(({id}) => id)).toEqual([
      "kepler",
      "wrj-algorithm-region",
      "wrj-algorithm-scanned",
      "wrj-algorithm-strips",
      "wrj-algorithm-routes",
      "wrj-algorithm-trips",
      "wrj-algorithm-uav-triangles"
    ]);
  });

  it("replaces previously appended mission layers when vertical scale changes", () => {
    const scaleOneLayers = createMissionOverlayLayers({
      bundle,
      missionTimeSec: 5,
      verticalScale: 1,
      preferences,
      dynamic: null
    });
    const firstFrame = mergeDeckRenderCallbacks(
      undefined,
      scaleOneLayers
    ).onDeckRender?.({layers: []});
    const scaleFourLayers = createMissionOverlayLayers({
      bundle,
      missionTimeSec: 5,
      verticalScale: 4,
      preferences,
      dynamic: null
    });
    const nextFrame = mergeDeckRenderCallbacks(
      undefined,
      scaleFourLayers
    ).onDeckRender?.(firstFrame ?? {layers: []});
    const nextLayers = nextFrame?.layers as Array<{id: string; props: unknown}>;

    expect(nextLayers.find(({id}) => id === "wrj-algorithm-routes"))
      .toBe(scaleFourLayers[3]);
    expect(nextLayers.find(({id}) => id === "wrj-algorithm-trips"))
      .toBe(scaleFourLayers[4]);
    expect(nextLayers.find(({id}) => id === "wrj-algorithm-uav-triangles"))
      .toBe(scaleFourLayers[5]);

    const route = scaleFourLayers[3].props as {
      data: CaseBundleV2["sorties"];
      getPath: (sortie: CaseBundleV2["sorties"][number]) => number[][];
    };
    const positiveAltitudeIndex = bundle.sorties[0].trip.findIndex(
      point => point[2] > 0
    );
    expect(positiveAltitudeIndex).toBeGreaterThanOrEqual(0);
    expect(route.getPath(route.data[0])[positiveAltitudeIndex][2]).toBe(
      bundle.sorties[0].trip[positiveAltitudeIndex][2] * 4
    );

    type MarkerProps = {
      data: Array<{position: readonly [number, number, number]}>;
      getPosition: (
        datum: {position: readonly [number, number, number]}
      ) => number[];
    };
    const scaleOneMarker = scaleOneLayers[5].props as MarkerProps;
    const scaleFourMarker = scaleFourLayers[5].props as MarkerProps;
    expect(scaleFourMarker.getPosition(scaleFourMarker.data[0])[2]).toBe(
      scaleOneMarker.getPosition(scaleOneMarker.data[0])[2] * 4
    );
  });

  it("keeps null from the original onDeckRender callback", () => {
    const callbacks = mergeDeckRenderCallbacks(
      {onDeckRender: () => null},
      createMissionOverlayLayers({
        bundle,
        missionTimeSec: 5,
        verticalScale: 1,
        preferences,
        dynamic: null
      })
    );

    expect(callbacks.onDeckRender?.({layers: []})).toBeNull();
  });
});
