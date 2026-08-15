import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEarthquakes } from "@/lib/data/data-gov-weather";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("fetchEarthquakes", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("uses the live USGS regional catalogue", async () => {
    const time = Date.parse("2026-08-15T10:54:51.796Z");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        features: [{
          properties: {
            mag: 6.9,
            magType: "mww",
            place: "15 km NNW of Pematangsiantar, Indonesia",
            time,
          },
          geometry: { coordinates: [99.04, 3.09, 172.526] },
        }],
      }),
    });

    const earthquakes = await fetchEarthquakes();

    expect(mockFetch.mock.calls[0][0]).toContain("earthquake.usgs.gov");
    expect(mockFetch.mock.calls[0][0]).toContain("maxradiuskm=3000");
    expect(earthquakes).toEqual([expect.objectContaining({
      utcDatetime: "2026-08-15T10:54:51.796Z",
      magnitude: 6.9,
      magnitudeType: "mww",
      depth: 173,
      source: "USGS",
    })]);
  });

  it("enriches a matching USGS event with MET Malaysia status", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          features: [{
            properties: {
              mag: 5.4,
              magType: "mb",
              place: "Southern Sumatra, Indonesia",
              time: Date.parse("2026-08-09T15:15:03Z"),
            },
            geometry: { coordinates: [102.58, -4.54, 50.6] },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          utcdatetime: "2026-08-09T15:16:00",
          localdatetime: "2026-08-09T23:16:00",
          lat: -4.5,
          lon: 102.6,
          depth: 51,
          location: "Southern Sumatra",
          location_original: "Southern Sumatra, Indonesia",
          magdefault: 5.3,
          magtypedefault: "mb",
          status: "FELT",
          visible: true,
        }]),
      });

    const earthquakes = await fetchEarthquakes();

    expect(earthquakes).toHaveLength(1);
    expect(earthquakes[0]).toEqual(expect.objectContaining({
      status: "FELT",
      source: "USGS + MET Malaysia",
    }));
  });

  it("keeps nearby but separate earthquakes as two events", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          features: [{
            properties: {
              mag: 5.4,
              magType: "mb",
              place: "Southern Sumatra, Indonesia",
              time: Date.parse("2026-08-09T15:15:03Z"),
            },
            geometry: { coordinates: [102.58, -4.54, 50.6] },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          utcdatetime: "2026-08-09T15:16:00",
          localdatetime: "2026-08-09T23:16:00",
          lat: -3.2,
          lon: 102.58,
          depth: 30,
          location: "Central Sumatra",
          location_original: "Central Sumatra, Indonesia",
          magdefault: 5.3,
          magtypedefault: "mb",
          status: "NORMAL",
          visible: true,
        }]),
      });

    const earthquakes = await fetchEarthquakes();

    expect(earthquakes).toHaveLength(2);
    expect(earthquakes.map((event) => event.source)).toEqual([
      "MET Malaysia",
      "USGS",
    ]);
  });

  it("falls back to the MET Malaysia bulletin when USGS fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{
          utcdatetime: "2026-08-09T15:15:03",
          localdatetime: "2026-08-09T23:15:03",
          lat: -4.54,
          lon: 102.58,
          depth: 51,
          location: "Southern Sumatra",
          location_original: "Southern Sumatra, Indonesia",
          magdefault: 5.3,
          magtypedefault: "mb",
          status: "NORMAL",
          visible: true,
        }]),
      });

    const earthquakes = await fetchEarthquakes();

    expect(mockFetch.mock.calls[1][0]).toContain("api.data.gov.my");
    expect(earthquakes[0]).toEqual(expect.objectContaining({
      datetime: "2026-08-09T23:15:03+08:00",
      utcDatetime: "2026-08-09T15:15:03Z",
      source: "MET Malaysia",
    }));
  });
});
