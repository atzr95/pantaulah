import { describe, it, expect } from "vitest";
import { windowStart, currentHourIndex, type LiveGrid } from "@/lib/live/grid-field";

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
