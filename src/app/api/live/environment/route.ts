import { NextRequest, NextResponse } from "next/server";
import {
  fetchFires,
  fetchRiverHistory,
  fetchRivers,
  fetchShelters,
} from "@/lib/server/environment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const station = request.nextUrl.searchParams.get("station") ?? "";
  if (
    !["rivers", "shelters", "fires", "history"].includes(kind ?? "") ||
    (kind === "history" && !/^[A-Za-z0-9_()-]{1,80}$/.test(station))
  )
    return NextResponse.json(
      { error: "Invalid data request" },
      { status: 400 },
    );
  try {
    const source =
      kind === "rivers"
        ? await fetchRivers()
        : kind === "shelters"
          ? await fetchShelters()
          : kind === "fires"
            ? await fetchFires()
            : await fetchRiverHistory(station);
    // fetchedAt is when the server downloaded the source, not when it answered.
    return NextResponse.json(source, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "Source data is unavailable. Try again shortly." },
      { status: 503 },
    );
  }
}
