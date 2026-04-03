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

/**
 * Returns a signed URL for the CCTV iframe.
 *
 * The vigroot endpoint returns 30MB+ HTML with base64 images which exceeds
 * Cloudflare edge worker limits. Instead, we only proxy the tiny signature
 * request and let the user's browser load images directly via iframe.
 */
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
    // Fetch signature — small JSON, works from Cloudflare edge
    const sigRes = await fetch(
      `https://www.llm.gov.my/assets/ajax.get_sig.php?h=${highway}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!sigRes.ok) {
      return NextResponse.json({ error: "Failed to get signature" }, { status: 502 });
    }
    const { t, sig } = await sigRes.json();

    // Return the signed URL — the client's browser loads this in an iframe
    const iframeUrl = `https://www.llm.gov.my/assets/ajax.vigroot.php?h=${highway}&t=${t}&sig=${sig}`;

    return NextResponse.json(
      { highway, iframeUrl },
      { headers: { "Cache-Control": "no-cache" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `CCTV failed: ${String(err)}` },
      { status: 502 }
    );
  }
}
