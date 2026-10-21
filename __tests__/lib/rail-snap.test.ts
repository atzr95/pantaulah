import { describe, it, expect } from "vitest";
import { railNetwork, snapToRail } from "@/lib/live/rail-snap";
import { snapToNetwork } from "@/lib/live/line-snap";

describe("snapToRail", () => {
  it("moves a reported position onto a KTM track, with its heading", () => {
    const butterworth = snapToRail(100.3648, 5.3953);
    expect(butterworth).not.toBeNull();
    expect(butterworth!.bearing).toBeGreaterThanOrEqual(0);
    expect(butterworth!.bearing).toBeLessThan(360);
    expect([butterworth!.lon, butterworth!.lat]).not.toEqual([100.3648, 5.3953]);
    expect(snapToNetwork(railNetwork, butterworth!.lon, butterworth!.lat, 0.01)).not.toBeNull();
    expect(snapToRail(104.5, 4.0)).toBeNull(); // open sea
  });
});
