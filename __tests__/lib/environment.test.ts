import { describe, expect, it, vi } from "vitest";
import {
  fetchShelters,
  parseFires,
  parseRiverHistory,
  parseRivers,
  parseShelters,
} from "@/lib/server/environment";
import {
  jpsDate,
  malaysiaState,
  treeLossTiles,
  currentEnvironmentSelection,
} from "@/lib/data/environment";

const edgeCache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/server/edge-cache", () => ({
  cachedJson: async (key: string, _ttl: number, fetcher: () => unknown) => {
    if (!edgeCache.has(key)) edgeCache.set(key, await fetcher());
    return edgeCache.get(key);
  },
}));

const now = Date.parse("2026-10-20T11:30:00Z");
const station = {
  a: "27547",
  b: "Sg. Bentong",
  c: "3.51",
  d: "101.91",
  e: "Bentong",
  f: "PAHANG",
  i: "WL",
  m: "85.03",
  n: "Alert",
  o: "85",
  q: "20/10/2026 19:15",
  s: "Rising",
};

describe("Malaysia environment sources", () => {
  it("uses Malaysia time and the app's state names", () => {
    expect(jpsDate("20/10/2026 19:15")).toBe("2026-10-20T11:15:00.000Z");
    expect(jpsDate("not a time")).toBeNull();
    expect(malaysiaState(" PULAU PINANG ")).toBe("Penang");
    expect(malaysiaState("WILAYAH PERSEKUTUAN KUALA LUMPUR ")).toBe(
      "Kuala Lumpur",
    );
    expect(malaysiaState("W.P. Labuan")).toBe("Labuan");
    expect(malaysiaState("Unknown")).toBeNull();
  });
  it("keeps fresh river readings and rejects stale, missing, future and invalid stations", () => {
    const rivers = parseRivers(
      [
        station,
        { ...station, m: "-9999" },
        { ...station, q: "19/10/2026 19:00" },
        { ...station, q: "21/10/2026 19:00" },
        { ...station, c: "0", d: "0" },
        { ...station, n: "Unknown" },
      ],
      now,
    );
    expect(rivers).toEqual([
      expect.objectContaining({
        id: "27547",
        state: "Pahang",
        level: 85.03,
        status: "Alert",
        observedAt: "2026-10-20T11:15:00.000Z",
      }),
    ]);
    expect(() => parseRivers([{ ...station, m: "-9999" }], now)).toThrow(
      "No recent",
    );
    expect(() => parseRivers([], now)).toThrow("No recent");
    expect(
      parseRivers([{ ...station, n: "Danger", o: "0" }], now)[0].status,
    ).toBe("Unknown");
  });
  it("accepts an empty shelter list but does not turn invalid locations into all clear", () => {
    expect(parseShelters({ points: [] })).toEqual([]);
    const shelter = {
      id: 1,
      name: "Dewan",
      negeri: "Sabah",
      daerah: "Tawau",
      latti: 4.29,
      longi: 117.88,
      bencana: "Kebakaran",
      mangsa: 174,
      keluarga: 57,
      kapasiti: 69.6,
    };
    expect(parseShelters({ points: [shelter] })[0]).toMatchObject({
      id: "1",
      people: 174,
      capacityUsed: 69.6,
    });
    expect(() =>
      parseShelters({ points: [{ ...shelter, longi: 0 }] }),
    ).toThrow();
  });
  it("reports when a cached source was downloaded, not when it was served", async () => {
    const download = vi.fn(async () => Response.json({ points: [] }));
    vi.stubGlobal("fetch", download);
    vi.useFakeTimers({ now: Date.parse("2026-10-20T11:00:00Z") });
    await fetchShelters();
    vi.setSystemTime(Date.parse("2026-10-20T11:04:00Z"));
    const { fetchedAt } = await fetchShelters();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    expect(fetchedAt).toBe("2026-10-20T11:00:00.000Z");
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("validates fire dates, keeps Indonesian haze sources, and removes duplicate detections", () => {
    const header = "latitude,longitude,acq_date,acq_time,satellite,confidence";
    const csv = [
      header,
      "1.2,111.6,2026-10-20,0608,N20,nominal",
      "1.2,111.6,2026-10-20,0608,N20,nominal",
      "-3,105,2026-10-19,2300,N20,high",
      "-3,130,2026-10-19,2300,N20,high",
      "1,111,2026-10-01,0608,N20,low",
      "1,111,2026-10-21,0608,N20,low",
      ",111,2026-10-20,0608,N20,low",
      "1,not-a-number,2026-10-20,0608,N20,low",
    ].join("\n");
    const fires = parseFires(csv, now);
    expect(fires).toHaveLength(2);
    expect(fires[0].observedAt).toBe("2026-10-20T06:08:00.000Z");
    expect(() => parseFires("<html>error</html>", now)).toThrow();
  });
  it("keeps missing river history as gaps and drops zero warning levels", () => {
    const data = {
      info: {
        name: "Beaufort",
        normal: "0",
        alert: "0",
        warning: "0",
        danger: "0",
      },
      values: [
        { dt: "20/10/2026 19:00", final: "-9999" },
        { dt: "20/10/2026 19:05", final: "-0.13" },
      ],
    };
    const history = parseRiverHistory(data);
    expect(history.thresholds).toEqual([]);
    expect(history.readings.map((r) => r.value)).toEqual([null, -0.13]);
    expect(
      parseRiverHistory({
        ...data,
        info: {
          ...data.info,
          normal: "1",
          alert: "2",
          warning: "3",
          danger: "4",
        },
      }).thresholds,
    ).toHaveLength(4);
  });
  it("requests one exact tree-loss year rather than accumulated loss", () => {
    expect(treeLossTiles(2024)).toContain("start_year=2024&end_year=2024");
  });
  it("updates an open item's details from the new report and marks removed items", () => {
    const river = parseRivers([station], now)[0];
    const latest = { ...river, level: 85.5 };
    expect(
      currentEnvironmentSelection(
        { kind: "river", data: river },
        { rivers: [latest], shelters: [], fires: [] },
      ),
    ).toEqual({ selection: { kind: "river", data: latest }, current: true });
    expect(
      currentEnvironmentSelection(
        { kind: "river", data: river },
        { rivers: [], shelters: [], fires: [] },
      )?.current,
    ).toBe(false);
  });
});
