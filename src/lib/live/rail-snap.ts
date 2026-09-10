import railDetail from "@/lib/data/rail-detail.json";

/**
 * Heading of the nearest KTM track segment to a point, in degrees clockwise
 * from north. GTFS-RT reports bearing 0 for stopped trains, so the box would
 * point north across the platform; the track direction is always right.
 *
 * ponytail: brute force over ~12k heavy-rail segments per train (tens of
 * trains) — a few ms per refresh. Grid-index it if that ever shows up.
 */

const M_PER_DEG = 111_320;

interface Seg { ax: number; ay: number; bx: number; by: number; bearing: number }

/** Heavy-rail (KTM) segments in local metres (equirectangular around Malaysia). */
const SEGMENTS: Seg[] = (() => {
  const out: Seg[] = [];
  const cosLat = Math.cos((4 * Math.PI) / 180);
  for (const f of railDetail.features) {
    if (f.properties.kind !== "rail") continue;
    for (const line of f.geometry.coordinates) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon0, lat0] = line[i], [lon1, lat1] = line[i + 1];
        const ax = lon0 * cosLat * M_PER_DEG, ay = lat0 * M_PER_DEG;
        const bx = lon1 * cosLat * M_PER_DEG, by = lat1 * M_PER_DEG;
        const bearing = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
        out.push({ ax, ay, bx, by, bearing });
      }
    }
  }
  return out;
})();

/** Track heading near (lon, lat) if a KTM line passes within `maxM` metres, else null. */
export function railBearingNear(lon: number, lat: number, maxM = 300): number | null {
  const cosLat = Math.cos((4 * Math.PI) / 180);
  const px = lon * cosLat * M_PER_DEG, py = lat * M_PER_DEG;
  let best = maxM * maxM, bearing: number | null = null;
  for (const s of SEGMENTS) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
    const ex = s.ax + t * dx - px, ey = s.ay + t * dy - py;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; bearing = s.bearing; }
  }
  return bearing;
}
