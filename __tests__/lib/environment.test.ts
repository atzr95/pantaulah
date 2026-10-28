import { describe, expect, it, vi } from "vitest";
import {
  fetchRivers,
  fetchRiverHistory,
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
  station_id: "0020541WL",
  station_name: "Sg. Laka di Kg. Padang Pasir (F2)",
  state: "Kedah",
  district: "Kubang Pasu",
  water_level: "21.36",
  normal: "18.50",
  alert: "21.00",
  warning: "21.30",
  danger: "21.60",
  wl_severity: "AMARAN",
  last_update: "20/10/2026 19:15:00",
  trend: "Receding",
  graph_url: "https://telemetry.didkedah.gov.my/WaterLevel/Station/184",
};

describe("Malaysia environment sources", () => {
  it("uses Malaysia time and the app's state names", () => {
    expect(jpsDate("20/10/2026 19:15")).toBe("2026-10-20T11:15:00.000Z");
    expect(jpsDate("20/10/2026 19:15:30")).toBe("2026-10-20T11:15:30.000Z");
    expect(jpsDate("2026-10-20T19:15:30")).toBe("2026-10-20T11:15:30.000Z");
    expect(jpsDate("not a time")).toBeNull();
    expect(malaysiaState(" PULAU PINANG ")).toBe("Penang");
    expect(malaysiaState("WILAYAH PERSEKUTUAN KUALA LUMPUR ")).toBe(
      "Kuala Lumpur",
    );
    expect(malaysiaState("W.P. Labuan")).toBe("Labuan");
    expect(malaysiaState("Unknown")).toBeNull();
  });
  it("reads the new JPS format without inventing locations or treating stale readings as current", () => {
    const rivers = parseRivers(
      [
        station,
        { ...station, water_level: "-9999" },
        { ...station, water_level: "" },
        { ...station, last_update: "19/10/2026 19:00:00" },
        { ...station, last_update: "21/10/2026 19:00:00" },
        { ...station, state: "Unknown" },
        { ...station, station_id: "" },
      ],
      now,
    );
    expect(rivers).toEqual([
      expect.objectContaining({
        id: "Kedah_0020541WL",
        state: "Kedah",
        level: 21.36,
        status: "Warning",
        threshold: 21.3,
        lat: null,
        lon: null,
        observedAt: "2026-10-20T11:15:00.000Z",
      }),
    ]);
    expect(() => parseRivers([{ ...station, water_level: "-9999" }], now)).toThrow(
      "No recent",
    );
    expect(() => parseRivers([], now)).toThrow("No recent");
    expect(
      parseRivers([{ ...station, wl_severity: "BAHAYA", danger: "0" }], now)[0].status,
    ).toBe("Unknown");
    expect(parseRivers([{ ...station, wl_severity: null }], now)[0].status).toBe("Unknown");
    expect(parseRivers([{ ...station, warning: "22" }], now)[0].status).toBe("Unknown");
    expect(parseRivers([{ ...station, wl_severity: "toString" }], now)[0].status).toBe("Unknown");
    expect(parseRivers([{ ...station, trend: "RISING" }], now)[0].trend).toBe("Rising");
    expect(parseRivers([{ ...station, graph_url: "https://evil.example/WaterLevel/Station/184" }], now)[0].graphUrl).toBeNull();
    expect(parseRivers([station, { ...station, state: "Perak" }], now).map(r => r.id)).toEqual(["Kedah_0020541WL", "Perak_0020541WL"]);
  });
  it("uses the website's current public token and requires every state request to succeed", async () => {
    edgeCache.clear();
    vi.useFakeTimers({ now });
    const download = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/waterleveldata/Kedah")) return new Response("'Authorization': 'Bearer public-test-token'");
      expect(url).toBe("https://publicinfobanjir.water.gov.my/api/detailstation");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer public-test-token" });
      const { state } = JSON.parse(options?.body as string);
      return state === "Sabah" ? new Response("unavailable", { status: 503 }) : Response.json([{ ...station, state }]);
    });
    vi.stubGlobal("fetch", download);
    try {
      await expect(fetchRivers()).rejects.toThrow("503");
      // 15 states + token page + one retry for Sabah.
      expect(download).toHaveBeenCalledTimes(17);
      expect([...edgeCache.keys()]).not.toContain("environment:rivers:v4");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      edgeCache.clear();
    }
  });
  it("recovers from one dropped state request and skips unusual rows instead of failing the feed", async () => {
    edgeCache.clear();
    vi.useFakeTimers({ now });
    let dropped = false;
    const download = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/waterleveldata/Kedah")) return new Response("'Authorization': 'Bearer public-test-token'");
      const { state } = JSON.parse(options?.body as string);
      if (state === "Sabah" && !dropped) { dropped = true; throw new TypeError("network"); }
      return Response.json([
        { ...station, state, water_level: 21.36, warning: 21.3, alert: 21, danger: 21.6, district: null },
        { ...station, state, station_id: "bad id with spaces" },
        { ...station, state, last_update: null },
      ]);
    });
    vi.stubGlobal("fetch", download);
    try {
      const source = await fetchRivers();
      expect(source.data).toHaveLength(15);
      expect(source.data[0]).toMatchObject({ level: 21.36, status: "Warning", district: "" });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      edgeCache.clear();
    }
  });
  it("caches national readings and follows only a known station's official history address", async () => {
    edgeCache.clear();
    vi.useFakeTimers({ now });
    const download = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/waterleveldata/Kedah")) return new Response("'Authorization': 'Bearer public-test-token'");
      if (url === "https://telemetry.didkedah.gov.my/WaterLevel/GetWaterLevelGraph/184") return Response.json({
        stationName: station.station_name,
        normalSetPoint: 18.5, alertSetPoint: 21, warningSetPoint: 21.3, dangerSetPoint: 21.6,
        data: [{ timestamp: "2026-10-20T19:15:00", wl: 21.36 }],
      });
      expect(url).toBe("https://publicinfobanjir.water.gov.my/api/detailstation");
      const { state } = JSON.parse(options?.body as string);
      return Response.json([{ ...station, state }]);
    });
    vi.stubGlobal("fetch", download);
    try {
      const source = await fetchRivers();
      expect(source.data).toHaveLength(15);
      await fetchRivers();
      expect(download).toHaveBeenCalledTimes(16);
      const history = await fetchRiverHistory("Kedah_0020541WL");
      expect(history.data.readings).toEqual([{ time: "2026-10-20T11:15:00.000Z", value: 21.36 }]);
      await expect(fetchRiverHistory("not-a-station")).rejects.toThrow("unavailable");
      expect(download).toHaveBeenCalledTimes(17);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      edgeCache.clear();
    }
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
      stationName: "Beaufort",
      normalSetPoint: 0,
      alertSetPoint: 0,
      warningSetPoint: 0,
      dangerSetPoint: 0,
      data: [
        { timestamp: "2026-10-20T19:00:00", wl: -9999 },
        { timestamp: "2026-10-20T19:05:00", wl: -0.13 },
      ],
    };
    const history = parseRiverHistory(data);
    expect(history.thresholds).toEqual([]);
    expect(history.readings.map((r) => r.value)).toEqual([null, -0.13]);
    expect(
      parseRiverHistory({
        ...data,
        normalSetPoint: 1,
        alertSetPoint: 2,
        warningSetPoint: 3,
        dangerSetPoint: 4,
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
