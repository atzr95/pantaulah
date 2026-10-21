export type Point = [number, number];
const M = 111_320;
const X = M * Math.cos(4 * Math.PI / 180);
const key = (p: Point) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

export interface NetworkLine { coordinates: number[][]; oneway: -1 | 0 | 1 }
interface Segment { a: Point; b: Point; length: number; bearing: number; oneway: -1 | 0 | 1 }
export interface LineNetwork { segments: Segment[]; joins: Map<string, number[]> }
export interface LineMatch { lon: number; lat: number; bearing: number; segment: number; t: number; reverse: boolean }

export function lineNetwork(lines: (number[][] | NetworkLine)[]): LineNetwork {
  const segments: Segment[] = [], joins = new Map<string, number[]>();
  for (const input of lines) {
    const line = Array.isArray(input) ? input : input.coordinates;
    const oneway = Array.isArray(input) ? 0 : input.oneway;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as Point, b = line[i] as Point;
      const dx = (b[0] - a[0]) * X, dy = (b[1] - a[1]) * M;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length < 0.01) continue;
      const id = segments.length;
      segments.push({ a, b, length, bearing: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, oneway });
      for (const p of [a, b]) {
        const k = key(p), ids = joins.get(k) ?? [];
        ids.push(id); joins.set(k, ids);
      }
    }
  }
  return { segments, joins };
}

const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
export const distanceMetres = (a: Point, b: Point) => Math.hypot((b[0] - a[0]) * X, (b[1] - a[1]) * M);

/** Infer a short connected path between reports; never bridge gaps in the map. */
export function pathOnNetwork(network: LineNetwork, from: Point, to: Point, maxSnapM = 1): Point[] | null {
  const start = snapToNetwork(network, ...from, maxSnapM), end = snapToNetwork(network, ...to, maxSnapM);
  if (!start || !end) return null;
  const a: Point = [start.lon, start.lat], b: Point = [end.lon, end.lat];
  const first = network.segments[start.segment], last = network.segments[end.segment];
  if (start.segment === end.segment && (!first.oneway || (end.t - start.t) * first.oneway >= 0)) return [a, b];
  const limit = Math.min(20_000, Math.max(200, distanceMetres(a, b) * 3));
  const queue: { id: string; point: Point; cost: number; rank: number }[] = [];
  const costs = new Map<string, number>(), previous = new Map<string, string>();
  const points = new Map<string, Point>();
  const add = (id: string, point: Point, cost: number, parent?: string) => {
    if (cost > limit || cost >= (costs.get(id) ?? Infinity)) return;
    costs.set(id, cost); points.set(id, point);
    if (parent !== undefined) previous.set(id, parent);
    const rank = cost + distanceMetres(point, b);
    let lo = 0, hi = queue.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (queue[mid].rank < rank) lo = mid + 1; else hi = mid; }
    queue.splice(lo, 0, { id, point, cost, rank });
  };
  if (first.oneway !== 1) add(key(first.a), first.a, first.length * start.t);
  if (first.oneway !== -1) add(key(first.b), first.b, first.length * (1 - start.t));
  for (let count = 0; queue.length && count < 10_000; count++) {
    const node = queue.shift()!;
    if (node.cost !== costs.get(node.id)) continue;
    if (node.id === "goal") {
      const route: Point[] = [b];
      let id = previous.get(node.id);
      while (id !== undefined) { route.push(points.get(id)!); id = previous.get(id); }
      route.push(a);
      return route.reverse();
    }
    if (last.oneway !== -1 && node.id === key(last.a)) add("goal", b, node.cost + last.length * end.t, node.id);
    if (last.oneway !== 1 && node.id === key(last.b)) add("goal", b, node.cost + last.length * (1 - end.t), node.id);
    for (const id of network.joins.get(node.id) ?? []) {
      const segment = network.segments[id];
      const forward = key(segment.a) === node.id;
      if ((forward && segment.oneway === -1) || (!forward && segment.oneway === 1)) continue;
      const next = forward ? segment.b : segment.a;
      add(key(next), next, node.cost + segment.length, node.id);
    }
  }
  return null;
}

/** Project onto a nearby line; a known travel direction rules out crossing roads. */
export function snapToNetwork(network: LineNetwork, lon: number, lat: number, maxM: number, heading?: number): LineMatch | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  let best = Infinity, match: LineMatch | null = null;
  network.segments.forEach((s, segment) => {
    const dx = (s.b[0] - s.a[0]) * X, dy = (s.b[1] - s.a[1]) * M;
    const t = Math.max(0, Math.min(1, (((lon - s.a[0]) * X * dx) + ((lat - s.a[1]) * M * dy)) / (s.length * s.length)));
    const x = s.a[0] + (s.b[0] - s.a[0]) * t, y = s.a[1] + (s.b[1] - s.a[1]) * t;
    const distance = Math.hypot((lon - x) * X, (lat - y) * M);
    if (distance > maxM) return;
    const reverse = s.oneway === -1 || (s.oneway !== 1 && heading !== undefined && angle(heading, s.bearing) > 90);
    const bearing = (s.bearing + (reverse ? 180 : 0)) % 360;
    const turn = heading === undefined ? 0 : angle(heading, bearing);
    if (turn > 60) return;
    const score = distance + turn * 0.5;
    if (score < best) { best = score; match = { lon: x, lat: y, bearing, segment, t, reverse }; }
  });
  return match;
}

/** Walk connected segments so each train car follows the same track through bends. */
export function pointAlongNetwork(network: LineNetwork, match: LineMatch, metres: number): Point {
  let id = match.segment, t = match.t;
  let forward = (metres >= 0) !== match.reverse;
  let left = Math.abs(metres);
  const visited = new Set<number>();
  while (true) {
    const s = network.segments[id];
    const available = (forward ? 1 - t : t) * s.length;
    if (left <= available) {
      const f = t + (forward ? 1 : -1) * left / s.length;
      return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
    }
    left -= available;
    visited.add(id);
    const end = forward ? s.b : s.a;
    const heading = (s.bearing + (forward ? 0 : 180)) % 360;
    // shortcut: take the straightest branch; use route paths when the feed supplies them.
    let next = -1, nextForward = true, bestTurn = 90;
    for (const candidate of network.joins.get(key(end)) ?? []) {
      if (visited.has(candidate)) continue;
      const n = network.segments[candidate], f = key(n.a) === key(end);
      const turn = angle(heading, (n.bearing + (f ? 0 : 180)) % 360);
      if (turn < bestTurn) { next = candidate; nextForward = f; bestTurn = turn; }
    }
    if (next < 0) return end;
    id = next; forward = nextForward; t = forward ? 0 : 1;
  }
}
