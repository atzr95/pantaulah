import { NextResponse } from "next/server";

/**
 * Fresh CCTV still for one camera, proxied.
 *
 * LLM's list endpoint returns signed image URLs whose `expires` is already in
 * the past when issued and which stop working within minutes, so a URL held by
 * the client goes stale. Fetching the list + image server-side on demand keeps
 * every click fresh. Not edge-cached (binary body); the client polls every 30 s
 * and the browser reuses one still for both the thumbnail and the fullscreen view.
 *
 * GET /api/cctv/image?h=PLS&name=PLUS%20CAM%20...
 */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const highway = searchParams.get("h") ?? "";
  const name = searchParams.get("name") ?? "";
  if (!/^[A-Z]{2,5}$/.test(highway) || !name || name.length > 80) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  try {
    const listRes = await fetch(`https://www.llm.gov.my/index.php/awam/get_data_ajax?highway=${highway}`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!listRes.ok) return new NextResponse(null, { status: 502 });
    // Body is prefixed with a UTF-8 BOM, which breaks res.json()
    const body = JSON.parse((await listRes.text()).replace(/^\uFEFF/, ""));
    const cam = ((body?.data ?? []) as { location_name?: string; url?: string }[]).find((c) => c.location_name === name);
    if (!cam?.url) return new NextResponse(null, { status: 404 });

    const img = await fetch(cam.url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10_000) });
    if (!img.ok) return new NextResponse(null, { status: 502 });
    // Only ever relay images: never serve upstream HTML/scripts from our origin
    const type = img.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return new NextResponse(null, { status: 502 });
    return new NextResponse(img.body, {
      headers: {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
