import { describe, it, expect } from "vitest";
import {
  formatPopulationCompact,
  formatGdp,
  formatChange,
  tweenValue,
} from "@/lib/utils/format";

describe("formatPopulationCompact", () => {
  it("formats millions", () => {
    expect(formatPopulationCompact(7205.3)).toBe("7.2M");
  });

  it("formats thousands", () => {
    expect(formatPopulationCompact(198.4)).toBe("198K");
  });

  it("handles undefined", () => {
    expect(formatPopulationCompact(undefined)).toBe("—");
  });
});

describe("formatGdp", () => {
  it("formats billions", () => {
    expect(formatGdp(384200)).toBe("RM 384.2B");
  });

  it("formats millions", () => {
    expect(formatGdp(500)).toBe("RM 500.0M");
  });

  it("handles undefined", () => {
    expect(formatGdp(undefined)).toBe("—");
  });
});

describe("formatChange", () => {
  it("formats positive change", () => {
    expect(formatChange(4.2, "YoY")).toBe("+4.2% YoY");
  });

  it("formats negative change", () => {
    expect(formatChange(-0.2, "QoQ")).toBe("-0.2% QoQ");
  });

  it("formats zero change", () => {
    expect(formatChange(0, "MoM")).toBe("+0.0% MoM");
  });

  it("handles undefined", () => {
    expect(formatChange(undefined)).toBe("");
  });

  it("defaults suffix to YoY", () => {
    expect(formatChange(1.5)).toBe("+1.5% YoY");
  });
});

describe("tweenValue", () => {
  it("interpolates the number and keeps decimals, grouping, and surrounding text", () => {
    expect(tweenValue("RM 1.0B", "RM 3.0B", 0.5)).toBe("RM 2.0B");
    expect(tweenValue("1,000", "3,000", 0.5)).toBe("2,000");
    expect(tweenValue("151.6 / 100K", "251.6 / 100K", 0.25)).toBe("176.6 / 100K");
  });

  it("returns the target when done or when either side has no number", () => {
    expect(tweenValue("1", "9", 1)).toBe("9");
    expect(tweenValue("N/A", "9", 0.5)).toBe("9");
    expect(tweenValue("9", "N/A", 0.5)).toBe("N/A");
  });
});
