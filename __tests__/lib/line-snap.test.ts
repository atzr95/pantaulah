import { describe, it, expect } from "vitest";
import { lineNetwork, pathOnNetwork, pointAlongNetwork, snapToNetwork } from "@/lib/live/line-snap";

describe("line matching", () => {
  const roads = lineNetwork([[[101, 3], [101.002, 3]], [[101.001, 2.999], [101.001, 3.001]]]);

  it("uses travel direction at crossings and preserves reverse travel", () => {
    const east = snapToNetwork(roads, 101.001, 3.00005, 40, 90)!;
    expect(east.lat).toBe(3);
    expect(east.bearing).toBe(90);
    expect(snapToNetwork(roads, 101.001, 3.00005, 40, 270)!.bearing).toBe(270);
    const west = snapToNetwork(roads, 101.001, 3.00005, 40, 270)!;
    expect(pointAlongNetwork(roads, west, 20)[0]).toBeLessThan(west.lon);
    expect(snapToNetwork(roads, 101.001, 3.00005, 40, 0)!.lon).toBe(101.001);
  });

  it("leaves distant or invalid positions unmatched", () => {
    expect(snapToNetwork(roads, 101.005, 3.005, 40)).toBeNull();
    expect(snapToNetwork(roads, NaN, 3, 40)).toBeNull();
    expect(snapToNetwork(lineNetwork([[[101, 3], [101, 3]]]), 101, 3, 40)).toBeNull();
  });

  it("walks bends and connected ways without jumping to a parallel track", () => {
    const rails = lineNetwork([
      [[101, 3], [101.001, 3]],
      [[101.002, 3.001], [101.001, 3]],
      [[101, 3.0001], [101.002, 3.0001]],
    ]);
    const train = snapToNetwork(rails, 101.0009, 3, 40)!;
    const front = pointAlongNetwork(rails, train, 40);
    expect(front[0]).toBeGreaterThan(101.001);
    expect(front[1]).toBeGreaterThan(3);
    expect(front[0] - 101.001).toBeCloseTo(front[1] - 3, 8);
    expect(pointAlongNetwork(rails, train, -20)[1]).toBe(3);
    expect(pointAlongNetwork(rails, train, -1000)).toEqual([101, 3]);
    expect(pointAlongNetwork(rails, train, 1000)).toEqual([101.002, 3.001]);
  });

  it("routes between reports through connected road bends instead of cutting across a block", () => {
    const network = lineNetwork([[[101, 3], [101.001, 3], [101.001, 3.001]], [[101.001, 3.001], [101.002, 3.001]]]);
    const path = pathOnNetwork(network, [101.0005, 3], [101.0015, 3.001])!;
    expect(path).toContainEqual([101.001, 3]);
    expect(path).toContainEqual([101.001, 3.001]);
    expect(path[0]).toEqual([101.0005, 3]);
    expect(path.at(-1)).toEqual([101.0015, 3.001]);
    expect(pathOnNetwork(network, [101.0015, 3.001], [101.0005, 3])!.slice(1, -1)).toEqual(path.slice(1, -1).reverse());
  });

  it("leaves a gap when roads do not connect or the detour is implausible", () => {
    const disconnected = lineNetwork([[[101, 3], [101.001, 3]], [[101, 3.0001], [101.001, 3.0001]]]);
    expect(pathOnNetwork(disconnected, [101.0005, 3], [101.0005, 3.0001])).toBeNull();
    const detour = lineNetwork([[[101, 3], [101.1, 3], [101.1, 3.0001], [101, 3.0001]]]);
    expect(pathOnNetwork(detour, [101, 3], [101, 3.0001])).toBeNull();
    expect(pathOnNetwork(disconnected, [102, 3], [101.0005, 3])).toBeNull();
  });

  it("does not snap onto the opposite one-way lane or drive backwards on it", () => {
    const lanes = lineNetwork([
      { coordinates: [[101, 3], [101, 3.002]], oneway: 1 },
      { coordinates: [[101.00005, 3], [101.00005, 3.002]], oneway: -1 },
    ]);
    expect(snapToNetwork(lanes, 101.00005, 3.001, 40, 0)!.lon).toBe(101);
    expect(snapToNetwork(lanes, 101, 3.001, 40, 180)!.lon).toBe(101.00005);
    expect(pathOnNetwork(lanes, [101, 3.0015], [101, 3.0005])).toBeNull();
    expect(pathOnNetwork(lanes, [101, 3.0005], [101, 3.0015])).not.toBeNull();
    expect(pathOnNetwork(lanes, [101.00005, 3.0005], [101.00005, 3.0015])).toBeNull();
  });
});
