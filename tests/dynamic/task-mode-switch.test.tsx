import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {
  TaskModeSwitch
} from "../../src/components/dynamic/TaskModeSwitch";

describe("TaskModeSwitch", () => {
  it("reports controlled mode changes with pressed state", () => {
    const onChange = vi.fn();
    render(<TaskModeSwitch mode="STATIC" onChange={onChange} />);

    expect(screen.getByRole("button", {
      name: "任务一 静态规划"
    })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", {
      name: "任务二 动态重规划"
    }));
    expect(onChange).toHaveBeenCalledWith("DYNAMIC");
  });
});
