import { NextResponse } from "next/server";


/** Highways with live CCTV feeds from LLM (Lembaga Lebuhraya Malaysia) */
const HIGHWAYS = [
  { code: "PLS", name: "PLUS Utara (North)", operator: "PLUS" },
  { code: "SPL", name: "PLUS Selatan (South)", operator: "PLUS" },
  { code: "KLK", name: "KL-Karak", operator: "ANIH" },
];

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface LLMCamera {
  file_name?: string;
  location_name?: string;
  url?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const highway = searchParams.get("h");

  // If no highway specified, return the list
  if (!highway) {
    return NextResponse.json({ highways: HIGHWAYS });
  }

  // Validate against known highway codes to prevent injection
  if (!HIGHWAYS.some((h) => h.code === highway)) {
    return NextResponse.json({ error: "Invalid highway code" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://www.llm.gov.my/index.php/awam/get_data_ajax?highway=${highway}`,
      {
        headers: { "User-Agent": BROWSER_UA },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to get cameras" }, { status: 502 });
    }

    // Body is prefixed with a UTF-8 BOM, which breaks res.json()
    const body = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));

    const cameras = ((body?.data ?? []) as LLMCamera[])
      .filter((cam): cam is LLMCamera & { url: string } => typeof cam.url === "string")
      .map((cam) => ({
        name: cam.location_name || cam.file_name || "UNKNOWN",
        image: cam.url,
      }));

    // Signed image URLs expire after ~300s, so cache for less than that
    return NextResponse.json(
      { highway, cameras },
      { headers: { "Cache-Control": "public, max-age=240" } }
    );
  } catch {
    return NextResponse.json({ error: "CCTV fetch failed" }, { status: 502 });
  }
}
