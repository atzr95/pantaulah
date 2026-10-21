import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBusPath } from "@/lib/live/bus-path";
import type { Point } from "@/lib/live/line-snap";

afterEach(() => vi.unstubAllGlobals());

describe("bus paths from road rules", () => {
  const from: Point = [101.0008, 3], to: Point = [101.0002, 3.0001];
  const legalTurn: Point[] = [from, [101.001, 3], [101.001, 3.0001], to];
  const response = {
    code: "Ok", waypoints: [{ distance: 0 }, { distance: 0 }],
    routes: [{ distance: 130, geometry: { type: "LineString", coordinates: legalTurn } }],
  };

  it("keeps the complete legal U-turn instead of replacing it with a shortcut", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchBusPath(from, to, [90, 270], new AbortController().signal)).toEqual(legalTurn);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("bearings")).toBe("90,45;270,45");
    expect(url.searchParams.get("radiuses")).toBe("40;40");
    expect(url.searchParams.get("overview")).toBe("full");
  });

  it("leaves a gap on service errors, bad data, or a path too far from the reports", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const result of [
      { ok: false },
      { ok: true, json: async () => ({ code: "NoRoute" }) },
      { ok: true, json: async () => ({ ...response, routes: [{ distance: 130, geometry: { type: "LineString", coordinates: [[104, 4], [104.001, 4]] } }] }) },
      { ok: true, json: async () => ({ ...response, waypoints: [{ distance: 500 }, { distance: 0 }] }) },
    ]) {
      fetch.mockResolvedValueOnce(result);
      expect(await fetchBusPath(from, to, [undefined, undefined], new AbortController().signal)).toBeNull();
    }
    fetch.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchBusPath(from, to, [undefined, undefined], new AbortController().signal)).toBeNull();
  });
});
