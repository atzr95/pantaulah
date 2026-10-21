import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("/api/ticker", () => {
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue({ ok: false });
  });

  it("parses BNM exchange rate response correctly", async () => {
    const bnmResponse = {
      data: [
        {
          currency_code: "USD",
          rate: { buying_rate: 4.2, selling_rate: 4.3, middle_rate: 4.25 },
        },
        {
          currency_code: "EUR",
          rate: { buying_rate: 4.6, selling_rate: 4.7, middle_rate: 4.65 },
        },
        {
          currency_code: "JPY",
          rate: { buying_rate: 0.028, selling_rate: 0.03, middle_rate: 0.029 },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(bnmResponse),
    });

    const { GET } = await import("@/app/api/ticker/route");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { new_opr_level: 2.75 } }),
    });

    const response = await GET();
    const data = await response.json();

    expect(data.rates).toEqual([
      { currency: "USD", rate: 4.25 },
      { currency: "EUR", rate: 4.65 },
      { currency: "JPY", rate: 0.029 },
    ]);
    expect(data.opr).toBe(2.75);
  });

  it("returns empty data with cache headers when feeds are down", async () => {
    const { GET } = await import("@/app/api/ticker/route");
    const response = await GET();
    const data = await response.json();

    expect(data.rates).toEqual([]);
    expect(data.headlines).toEqual([]);
    expect(response.headers.get("Cache-Control")).toContain("max-age=900");
  });

  it("parses RSS feed headlines", async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Selangor development plan announced</title>
          <link>https://example.com/1</link>
          <pubDate>Mon, 31 Mar 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Malaysia GDP growth exceeds expectations</title>
          <link>https://example.com/2</link>
          <pubDate>Mon, 31 Mar 2026 09:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    // BNM rates
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: [] }),
    });
    // OPR
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { new_opr_level: 2.75 } }),
    });
    // Fuel prices
    mockFetch.mockResolvedValueOnce({ ok: false });
    // Kijang Emas gold
    mockFetch.mockResolvedValueOnce({ ok: false });
    // Malay Mail
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(rssXml),
    });

    const { GET } = await import("@/app/api/ticker/route");
    const response = await GET();
    const data = await response.json();

    expect(data.headlines.length).toBe(2);
    expect(data.headlines[0].title).toContain("Selangor");
    expect(data.headlines[0].source).toBe("MALAY MAIL");
    expect(data.headlines[0].matchedStates).toContain("Selangor");
  });
});
