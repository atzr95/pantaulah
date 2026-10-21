import { z } from "zod";
import { distanceMetres, type Point } from "./line-snap";

const responseSchema = z.object({
  code: z.literal("Ok"),
  waypoints: z.array(z.object({ distance: z.number().finite().min(0).max(40) })).length(2),
  routes: z.array(z.object({
    distance: z.number().finite().min(0).max(20_000),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)])).min(2).max(20_000),
    }),
  })).min(1),
});

/** Use the road router's one-way and turn rules; never fall back to a guessed bus route. */
// shortcut: car road rules can miss bus-only access; use a bus profile when one is available.
export async function fetchBusPath(from: Point, to: Point, bearings: [number | undefined, number | undefined], signal: AbortSignal): Promise<Point[] | null> {
  try {
    const coordinates = [from, to].map((p) => p.map((n) => n.toFixed(6)).join(",")).join(";");
    const url = new URL(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}`);
    url.search = new URLSearchParams({
      overview: "full", geometries: "geojson", alternatives: "false", radiuses: "40;40",
      bearings: bearings.map((b) => b === undefined ? "" : `${Math.round((b + 360) % 360)},45`).join(";"),
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const path = parsed.data.routes[0].geometry.coordinates;
    if (distanceMetres(from, path[0]) > 40 || distanceMetres(to, path.at(-1)!) > 40) return null;
    return path;
  } catch {
    return null;
  }
}
