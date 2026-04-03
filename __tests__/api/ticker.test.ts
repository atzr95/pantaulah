import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We test the parsing logic by importing the GET handler
// Since the route uses fetch internally, we mock it

describe("/api/ticker", () => {
  beforeEach(() => {
    mockFetch.mockReset();
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

    // Import and call the handler
    const { GET } = await import("@/app/api/ticker/route");

    // Mock remaining fetches (OPR + RSS feeds)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { new_opr_level: 2.75 } }),
      })
      .mockResolvedValueOnce({ ok: false }) // Malay Mail RSS
      .mockResolvedValueOnce({ ok: false }) // FMT RSS
      .mockResolvedValueOnce({ ok: false }); // Bernama RSS

    const response = await GET();
    const data = await response.json();

    expect(data.rates).toBeDefined();
    expect(data.rates.length).toBeGreaterThan(0);
    expect(data.rates[0]).toHaveProperty("currency");
    expect(data.rates[0]).toHaveProperty("rate");
    expect(data.opr).toBe(2.75);
  });

  it("returns empty rates when BNM is down", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { GET } = await import("@/app/api/ticker/route");
    const response = await GET();
    const data = await response.json();

    expect(data.rates).toEqual([]);
    expect(data.headlines).toEqual([]);
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
    // Malay Mail
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(rssXml),
    });
    // FMT
    mockFetch.mockResolvedValueOnce({ ok: false });
    // Bernama
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { GET } = await import("@/app/api/ticker/route");
    const response = await GET();
    const data = await response.json();

    expect(data.headlines.length).toBe(2);
    expect(data.headlines[0].title).toContain("Selangor");
    expect(data.headlines[0].source).toBe("MALAY MAIL");
    expect(data.headlines[0].matchedStates).toContain("Selangor");
  });

  it("sets Cache-Control header", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { GET } = await import("@/app/api/ticker/route");
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
  });
});
