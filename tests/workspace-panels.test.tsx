import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {useState} from "react";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  DetailDrawer,
  type DrawerContent,
  type DetailDrawerProps
} from "../src/components/workspace/DetailDrawer";
import {
  caseBundleSchema,
  type CaseBundleV2
} from "../src/features/cases/caseBundle";
import {selectSortieStates} from "../src/features/mission/missionInterpolation";

afterEach(cleanup);

const bundle: CaseBundleV2 = caseBundleSchema.parse(JSON.parse(readFileSync(
  resolve("public/data/integration-cases/R10-LONG-TRANSIT-01/bundle.json"),
  "utf8"
)) as unknown);

function props(content: DrawerContent): DetailDrawerProps {
  return {
    bundle,
    liveSorties: selectSortieStates(bundle.sorties, 0),
    missionTime: 0,
    content,
    attribution: "© OpenStreetMap contributors",
    onClose: vi.fn()
  };
}

describe("DetailDrawer shell behavior", () => {
  it("states that the basemap is planar unless a DEM service is configured", () => {
    render(<DetailDrawer {...props({type: "overview"})} />);

    expect(screen.getByText(
      "当前公共/卫星底图为平面地图；仅配置 DEM 地形服务后才具备真实地形起伏。"
    )).toBeInTheDocument();
  });

  it("safely renders nothing for an unknown UAV or sortie", () => {
    const {rerender} = render(
      <DetailDrawer {...props({type: "uav", uavId: "UAV-99"})} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <DetailDrawer {...props({
        type: "sortie",
        assignmentId: "UNKNOWN"
      })} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus into the drawer, closes with Escape, and restores focus", () => {
    function DrawerHarness() {
      const [content, setContent] = useState<DrawerContent>(null);
      return (
        <>
          <button type="button" onClick={() => setContent({type: "overview"})}>
            打开任务概览
          </button>
          <DetailDrawer
            {...props(content)}
            onClose={() => setContent(null)}
          />
        </>
      );
    }

    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", {name: "打开任务概览"});
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", {name: "关闭详情"});
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, {key: "Escape"});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
