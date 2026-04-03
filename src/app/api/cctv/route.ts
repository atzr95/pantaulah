import { NextResponse } from "next/server";

export const runtime = "edge";

/** Available highway CCTV feeds from LLM (Lembaga Lebuhraya Malaysia) */
const HIGHWAYS = [
  { code: "PLS", name: "PLUS Utara (North)", operator: "PLUS" },
  { code: "SPL", name: "PLUS Selatan (South)", operator: "PLUS" },
  { code: "NKV", name: "NKVE", operator: "PLUS" },
  { code: "ELT", name: "ELITE", operator: "PLUS" },
  { code: "KLK", name: "KL-Karak", operator: "ANIH" },
  { code: "LPT", name: "LPT1 (East Coast)", operator: "LPT" },
  { code: "KSS", name: "KESAS", operator: "LITRAK" },
  { code: "LDP", name: "LDP (Damansara-Puchong)", operator: "LITRAK" },
  { code: "SPE", name: "SPE (Sungai Petani-Ayer Hitam)", operator: "SPE" },
  { code: "NPE", name: "NPE (New Pantai)", operator: "PROPEL" },
  { code: "BES", name: "BESRAYA", operator: "BESRAYA" },
  { code: "DUKE", name: "DUKE", operator: "EKOVEST" },
  { code: "DASH", name: "DASH", operator: "PROLINTAS" },
  { code: "SUKE", name: "SUKE", operator: "PROLINTAS" },
  { code: "GCE", name: "GCE (Guthrie)", operator: "GCE" },
  { code: "WCE", name: "WCE (West Coast)", operator: "WCE" },
  { code: "SDE", name: "Senai-Desaru", operator: "SDE" },
  { code: "LKS", name: "LEKAS (Kajang-Seremban)", operator: "LEKAS" },
  { code: "PNB", name: "Penang Bridge", operator: "PLUS" },
  { code: "SMT", name: "SMART Tunnel", operator: "SMART" },
  { code: "JKSB", name: "Penang 2nd Bridge", operator: "JKSB" },
  { code: "SRT", name: "SPRINT", operator: "SPRINT" },
  { code: "AKL", name: "AKLEH (Ampang)", operator: "AKLEH" },
  { code: "CKH", name: "GRANDSAGA (Cheras-Kajang)", operator: "GRANDSAGA" },
];

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
    // Step 1: Get signature
    const sigRes = await fetch(
      `https://www.llm.gov.my/assets/ajax.get_sig.php?h=${highway}`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!sigRes.ok) {
      return NextResponse.json({ error: `Signature failed: HTTP ${sigRes.status}` }, { status: 502 });
    }
    const { t, sig } = await sigRes.json();

    // Support ?limit=N to cap how many cameras to extract
    const limitParam = searchParams.get("limit");
    const maxCameras = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 200;

    // Step 2: Get camera images
    const imgRes = await fetch(
      `https://www.llm.gov.my/assets/ajax.vigroot.php?h=${highway}&t=${t}&sig=${sig}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Images failed: HTTP ${imgRes.status}` }, { status: 502 });
    }

    const html = await imgRes.text();

    // Parse HTML — images have src='data:image/...' title='CAM-NAME'
    const cameras: Array<{ name: string; image: string }> = [];
    const regex = /src='(data:image\/[^']+)'\s*title='([^']+)'/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      cameras.push({ name: match[2], image: match[1] });
      if (cameras.length >= maxCameras) break;
    }

    // Count remaining matches for total without storing image data
    let total = cameras.length;
    while (regex.exec(html) !== null) total++;

    return NextResponse.json(
      { highway, cameras, total },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch (err) {
    return NextResponse.json({ error: `CCTV exception: ${String(err)}` }, { status: 502 });
  }
}
