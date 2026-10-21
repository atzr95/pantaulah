import { describe, it, expect } from "vitest";
import {
  computeRankScale,
  getRampColor,
} from "@/lib/data/choropleth";

describe("computeRankScale", () => {
  it("spreads states evenly by rank, not by value", () => {
    // Heavily skewed values still get distinct positions
    const scale = computeRankScale({ a: 1, b: 2, c: 3, d: 1000 })!;
    expect(scale.t).toEqual({ a: 0, b: 1 / 3, c: 2 / 3, d: 1 });
    expect(scale.min).toBe(1);
    expect(scale.max).toBe(1000);
  });

  it("gives tied values the same position", () => {
    const scale = computeRankScale({ a: 5, b: 5, c: 9 })!;
    expect(scale.t.a).toBe(scale.t.b);
    expect(scale.t.c).toBe(1);
  });

  it("ignores missing values and needs at least 3", () => {
    expect(computeRankScale({ a: 1, b: 2, c: undefined })).toBeNull();
    expect(computeRankScale({ a: 1, b: 2, c: 3, d: undefined })!.t).not.toHaveProperty("d");
  });
});

describe("getRampColor", () => {
  it("distinguishes low, high and missing values on both ramps", () => {
    for (const hue of ["cyan", "amber"] as const) {
      expect(getRampColor(0, hue)).not.toBe(getRampColor(1, hue));
      expect(getRampColor(undefined, hue)).not.toBe(getRampColor(0, hue));
      expect(getRampColor(undefined, hue)).not.toBe(getRampColor(1, hue));
    }
  });
});
