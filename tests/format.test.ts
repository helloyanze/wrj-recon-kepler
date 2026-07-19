import {describe, expect, it} from "vitest";
import {formatDistance, formatMinutes, formatPercent} from "../src/utils/format";

describe("format helpers", () => {
  it("formats finite values with their display units", () => {
    expect(formatDistance(57.71)).toBe("57.71 km");
    expect(formatMinutes(17.6)).toBe("17.6 min");
    expect(formatPercent(0.98)).toBe("98%");
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    "renders unavailable numeric value %s as a dash",
    (value) => {
      expect(formatDistance(value)).toBe("—");
      expect(formatMinutes(value)).toBe("—");
      expect(formatPercent(value)).toBe("—");
    }
  );
});
