import type { Feature, Polygon } from "geojson";

/**
 * Night-side polygon (the solar terminator) for a given instant, as GeoJSON.
 * Standard low-precision solar position — good to ~1° which is all a shaded
 * overlay needs.
 */
export function nightPolygon(date = new Date()): Feature<Polygon> {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360; // mean longitude
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * (Math.PI / 180); // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180);
  const eps = (23.439 - 0.0000004 * n) * (Math.PI / 180);
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  // Greenwich hour angle of the sun
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const subsolarLon = ((gmst * 15 - (ra * 180) / Math.PI) * -1 + 540) % 360 - 180;

  // Terminator latitude for each longitude; night is on the side away from the sun.
  const ring: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const ha = ((lon - subsolarLon) * Math.PI) / 180;
    const lat = Math.atan(-Math.cos(ha) / Math.tan(decl)) * (180 / Math.PI);
    ring.push([lon, lat]);
  }
  const poleLat = decl > 0 ? -90 : 90; // night cap is over the pole opposite the sun's declination
  const coords: [number, number][] = [...ring, [180, poleLat], [-180, poleLat], ring[0]];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
