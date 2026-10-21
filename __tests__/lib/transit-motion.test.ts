import { describe, expect, it } from "vitest";
import { joinTrail, motionPath, sampleMotion } from "@/lib/live/transit-motion";
import { lineNetwork, type Point } from "@/lib/live/line-snap";

describe("smooth vehicle movement", () => {
  const path = motionPath([[101, 3], [101.001, 3], [101.001, 3.001]]);

  it("moves along each road leg, with the heading and trail following the turn", () => {
    const early = sampleMotion(path, 0.25), late = sampleMotion(path, 0.75);
    expect(early.point[1]).toBe(3);
    expect(early.bearing).toBe(90);
    expect(late.point[0]).toBe(101.001);
    expect(late.bearing).toBe(0);
    expect(late.trail[1]).toEqual([101.001, 3]);
    expect(late.trail.at(-1)).toEqual(late.point);
  });

  it("stops at the newest report and handles a stopped vehicle", () => {
    expect(sampleMotion(path, -1).point).toEqual([101, 3]);
    expect(sampleMotion(path, 2).point).toEqual([101.001, 3.001]);
    const stopped = motionPath([[101, 3], [101, 3]]);
    expect(sampleMotion(stopped, 0.5).point).toEqual([101, 3]);
  });

  it("fills a trail gap once connecting roads load, without a straight shortcut", () => {
    const from: Point = [101, 3], corner: Point = [101.001, 3], to: Point = [101.001, 3.001];
    const pieces = [[from], [to]];
    expect(joinTrail(null, pieces)).toEqual(pieces);
    const roads = lineNetwork([[from, corner, to]]);
    const joined = joinTrail(roads, pieces);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toContainEqual(corner);
    expect(joined[0][0]).toEqual(from);
    expect(joined[0].at(-1)).toEqual(to);
    expect(pieces).toEqual([[from], [to]]);
  });
});
