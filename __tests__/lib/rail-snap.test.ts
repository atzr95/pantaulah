import { describe, it, expect } from "vitest";
import { railBearingNear } from "@/lib/live/rail-snap";

describe("railBearingNear", () => {
  it("returns a heading beside a KTM station and null far from any track", () => {
    const butterworth = railBearingNear(100.3648, 5.3953);
    expect(butterworth).not.toBeNull();
    expect(butterworth!).toBeGreaterThanOrEqual(0);
    expect(butterworth!).toBeLessThan(360);
    expect(railBearingNear(104.5, 4.0)).toBeNull(); // open sea
  });
});
