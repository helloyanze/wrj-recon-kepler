// @vitest-environment jsdom
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const UAV_MASK_PATH = resolve("public/assets/uav-fixed-wing-mask.svg");

describe("UAV Deck.gl marker asset", () => {
  it("provides a safe white SVG mask that can be tinted at runtime", () => {
    const svg = readFileSync(UAV_MASK_PATH, "utf8");
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("svg");
    expect(document.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(svg).toMatch(/fill=["']#ffffff["']/i);
    expect(svg).not.toMatch(/#35c5ff|#ffb44d|#4ed6a0/i);
    expect(document.querySelector("script, foreignObject")).toBeNull();
  });
});
