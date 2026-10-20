import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GET } from "@/app/api/weather/route";
import WeatherSidebar from "@/components/weather/weather-sidebar";
import type { WeatherData } from "@/lib/data/weather-types";

const feeds = vi.hoisted(() => ({
  fetchForecasts: vi.fn(), fetchWarnings: vi.fn(), fetchEarthquakes: vi.fn(), fetchAirQuality: vi.fn(), fetchFloodAlerts: vi.fn(),
}));
vi.mock("@/lib/data/data-gov-weather", () => feeds);
vi.mock("@/lib/server/edge-cache", () => ({ cachedJson: (_key: string, _ttl: number, fetcher: () => unknown) => fetcher() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  feeds.fetchForecasts.mockResolvedValue([]);
  feeds.fetchEarthquakes.mockResolvedValue([]);
  feeds.fetchAirQuality.mockResolvedValue({ readings: [], fetchedAt: "" });
  feeds.fetchWarnings.mockResolvedValue([]);
  feeds.fetchFloodAlerts.mockResolvedValue({ stations: [], fetchedAt: "" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function showSidebar() {
  const response = await GET();
  const data: WeatherData = await response.json();
  render(<WeatherSidebar {...data} warningsAvailable={data.feedStatus.warnings} floodsAvailable={data.feedStatus.floods} selectedState={null} activeTab="live" variant="mobile" />);
  return data;
}

it("shows unavailable rather than all clear when the alert feeds fail", async () => {
  feeds.fetchWarnings.mockRejectedValue(new Error("offline"));
  feeds.fetchFloodAlerts.mockRejectedValue(new Error("offline"));
  const data = await showSidebar();
  expect(data.feedStatus).toEqual({ warnings: false, floods: false });
  expect(screen.queryByText(/ALL CLEAR/)).toBeNull();
  expect(screen.getByText("WARNING DATA UNAVAILABLE")).toBeTruthy();
  expect(screen.getByText("FLOOD DATA UNAVAILABLE")).toBeTruthy();
});

it("shows all clear only for a feed that succeeded", async () => {
  feeds.fetchFloodAlerts.mockRejectedValue(new Error("offline"));
  const data = await showSidebar();
  expect(data.feedStatus).toEqual({ warnings: true, floods: false });
  expect(screen.getAllByText(/ALL CLEAR/)).toHaveLength(1);
  expect(screen.getByText("FLOOD DATA UNAVAILABLE")).toBeTruthy();
});
