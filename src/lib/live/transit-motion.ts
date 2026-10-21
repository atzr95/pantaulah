import { distanceMetres, pathOnNetwork, type LineNetwork, type Point } from "./line-snap";

/** Rejoin saved trail pieces when new road tiles fill a previous gap. */
export function joinTrail(network: LineNetwork | null, pieces: Point[][]): Point[][] {
  const paths: Point[][] = [];
  for (const points of pieces) {
    const last = paths.at(-1), from = last?.at(-1), to = points[0];
    const bridge = from && network ? pathOnNetwork(network, from, to, 40) : null;
    if (last && from && (distanceMetres(from, to) < 0.1 || bridge)) last.push(...(bridge ?? []), ...points);
    else paths.push([...points]);
  }
  return paths;
}

export function motionPath(points: Point[]) {
  points = points.filter((p, i) => !i || distanceMetres(points[i - 1], p) > 0.01);
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + distanceMetres(points[i - 1], points[i]));
  return { points, distances, length: distances.at(-1)! };
}

/** Move only between known reports, stopping at the newest one without prediction. */
export function sampleMotion(path: ReturnType<typeof motionPath>, progress: number) {
  const distance = path.length * Math.max(0, Math.min(1, progress));
  let i = 1;
  while (i < path.points.length - 1 && path.distances[i] < distance) i++;
  const a = path.points[i - 1], b = path.points[i] ?? a;
  const length = (path.distances[i] ?? 0) - path.distances[i - 1];
  const t = length > 0 ? (distance - path.distances[i - 1]) / length : 0;
  const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const bearing = (Math.atan2((b[0] - a[0]) * Math.cos(4 * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI + 360) % 360;
  return { point, bearing, trail: [...path.points.slice(0, i), point] };
}
