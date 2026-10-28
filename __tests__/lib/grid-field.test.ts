import { describe, it, expect } from "vitest";
import { windowStart, currentHourIndex, windArrows, sampleGridCubic, smogColor, type LiveGrid } from "@/lib/live/grid-field";

// Two UTC days of hourly stamps, as Open-Meteo returns with forecast_days=2
const times = Array.from({ length: 48 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 29, i));
  return d.toISOString().slice(0, 13) + ":00";
});
const at = (h: number, m = 0) => Date.UTC(2026, 8, 29, h, m);

describe("windowStart", () => {
  it("starts one hour before the hour containing now", () => {
    expect(times[windowStart(times, at(10, 30))]).toBe("2026-09-29T09:00");
  });

  it("clamps at the start of the series", () => {
    expect(windowStart(times, at(0, 10))).toBe(0);
  });

  it("keeps the tail when now is past the series", () => {
    expect(windowStart(times, Date.UTC(2027, 0, 1))).toBe(46);
  });

  it("late in the UTC day the kept window still reaches into tomorrow", () => {
    const start = windowStart(times, at(23, 40));
    const kept = times.slice(start, start + 25);
    expect(kept.at(-1)).toBe("2026-09-30T22:00");
    expect(kept.length).toBe(25);
  });
});

describe("currentHourIndex over the trimmed window", () => {
  it("picks the hour nearest now, not the last hour of a stale day", () => {
    const now = at(23, 40);
    const start = windowStart(times, now);
    const kept = times.slice(start, start + 25);
    const grid = { times: kept } as LiveGrid;
    const realNow = Date.now;
    Date.now = () => Date.UTC(2026, 8, 30, 0, 20);
    try {
      expect(kept[currentHourIndex(grid)]).toBe("2026-09-30T00:00");
    } finally {
      Date.now = realNow;
    }
  });
});

describe("windArrows", () => {
  it("points where the wind blows to and keeps every second grid point", () => {
    // 3×3 grid; wind from the north-east (45°) everywhere, 12 km/h
    const grid = {
      lons: [100, 101, 102], lats: [1, 2, 3],
      windDir: Array(9).fill([45]), windSpeed: Array(9).fill([12]),
    } as unknown as LiveGrid;
    const arrows = windArrows(grid, 0);
    expect(arrows.map((a) => [a.lon, a.lat])).toEqual([[100, 1], [102, 1], [100, 3], [102, 3]]);
    expect(arrows[0]).toMatchObject({ to: 225, speed: 12 });
  });
});

describe("sampleGridCubic", () => {
  // 4×4 grid, one value per point for hour 0
  const grid = (values: number[]) =>
    ({ lons: [100, 101, 102, 103], lats: [1, 2, 3, 4], pm25: values.map((v) => [v]) }) as unknown as LiveGrid;

  it("passes through grid points and is 0 outside the grid", () => {
    const g = grid(Array.from({ length: 16 }, (_, i) => i * 10));
    expect(sampleGridCubic(g, g.pm25, 0, 101, 2)).toBeCloseTo(50);
    expect(sampleGridCubic(g, g.pm25, 0, 99, 2)).toBe(0);
  });

  it("stays between neighbouring values on a ramp", () => {
    const g = grid(Array.from({ length: 16 }, (_, i) => (i % 4) * 10));
    const mid = sampleGridCubic(g, g.pm25, 0, 101.5, 2.5);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(20);
  });

  it("does not ring into a clear hole beside a sharp peak", () => {
    const g = grid([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 400, 20, 20, 20, 20, 20]);
    for (let lon = 100; lon <= 103; lon += 0.25)
      for (let lat = 1; lat <= 4; lat += 0.25) expect(sampleGridCubic(g, g.pm25, 0, lon, lat)).toBeGreaterThanOrEqual(20);
  });
});

describe("smogColor", () => {
  it("leaves clean air transparent and gets darker and more opaque as PM2.5 rises", () => {
    expect(smogColor(5)[3]).toBe(0);
    const [mid, high, extreme] = [50, 150, 600].map(smogColor);
    expect(high[3]).toBeGreaterThanOrEqual(mid[3]);
    // Above the old 150 cap the colour still changes, so a haze event keeps its shape
    expect(extreme[0] + extreme[1] + extreme[2]).toBeLessThan(high[0] + high[1] + high[2]);
  });
});
