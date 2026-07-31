import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {
  DynamicDetailDrawer
} from "../../src/components/dynamic/DynamicDetailDrawer";
import {caseBundleSchema} from "../../src/features/cases/caseBundle";
import {buildDynamicScene} from "../../src/features/dynamic-replanning/buildDynamicScene";
import {
  sceneConfigSchema,
  sceneProvenanceSchema
} from "../../src/features/dynamic-replanning/dynamicSceneSchema";
import {missionViewV1Schema} from "../../src/features/dynamic-replanning/missionViewSchema";
import {
  missionViewFixture,
  sceneConfigFixture,
  sceneProvenanceFixture
} from "../fixtures/task2MissionViewFixture";

const baseline = caseBundleSchema.parse(JSON.parse(readFileSync(resolve(
  "public/data/integration-cases/R01-BASELINE-01/bundle.json"
), "utf8")));
const scene = buildDynamicScene({
  config: sceneConfigSchema.parse(sceneConfigFixture),
  baseline,
  view: missionViewV1Schema.parse(missionViewFixture),
  failureReport: null,
  provenance: sceneProvenanceSchema.parse(sceneProvenanceFixture)
});

describe("DynamicDetailDrawer", () => {
  it("renders source resource fields and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <DynamicDetailDrawer
        scene={scene}
        content={{type: "resource", resourceId: "UAV-01"}}
        onClose={onClose}
      />
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("UAV-01");
    expect(screen.getByRole("dialog")).toHaveTextContent("70.00 kg");
    expect(screen.getByRole("button", {
      name: "关闭动态详情"
    })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), {key: "Escape"});
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores focus when the drawer is removed", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const rendered = render(
      <DynamicDetailDrawer
        scene={scene}
        content={{type: "task", taskId: "REG-001"}}
        onClose={vi.fn()}
      />
    );
    rendered.rerender(
      <DynamicDetailDrawer
        scene={scene}
        content={null}
        onClose={vi.fn()}
      />
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
