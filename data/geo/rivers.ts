import type { FeatureCollection, Geometry } from "geojson";
import type { LngLat } from "./cartogram.ts";

/**
 * River main stems from Natural Earth's river and lake centre lines.
 *
 * Natural Earth splits a river into many pieces, some digitised upstream. Pieces with the same name are joined into a
 * graph, the longest path through it becomes the main stem, and every line is turned to run from source to mouth:
 * toward a known mouth if one is given, else toward the end that meets another river, else toward the nearer coast.
 */

export type RiverLine = {
  name: string;
  /** Natural Earth scalerank: 0–1 are the world's biggest rivers. */
  rank: number;
  /** Source → mouth. lines[0] is the main stem; any others are separate stretches of the same river. */
  lines: LngLat[][];
  /** Main stem length. */
  km: number;
  /** Points on the main stem near the mouth (3%, 6% and 10% of its length upstream), where discharge is sampled. */
  gauges: LngLat[];
};

/** Endpoints closer than this (degrees) are the same junction. */
const JOIN = 0.05;
/** Gaps up to this (degrees) between stretches of one river are bridged (lakes, dams). */
const BRIDGE = 0.5;
/** A river end this close (degrees) to another river's line meets it. */
const TOUCH = 0.1;
/** Separate stretches shorter than this are dropped. */
const MIN_BRANCH_KM = 150;
/** An end this close to the coast (degrees), with the other end well inland, is plainly at the sea. */
const SEA = 0.4;
const INLAND = 1.5;
/**
 * Pieces of one name farther apart than this (degrees) are different rivers: the Colorado in the US and in Argentina,
 * the Río Negro and the Rio Negro. Natural Earth leaves gaps of 10–12° inside the Irtysh and the Salween, so it is set
 * above those.
 */
const NAMESAKE_DEG = 15;
/** Different rivers that share a name and lie closer than NAMESAKE_DEG; they split at a few degrees instead. */
const NAMESAKES: Record<string, number> = { Grande: 5 };
const SIMPLIFY = 0.02;
const GAUGES = [0.03, 0.06, 0.1];

export function km(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const lineKm = (pts: LngLat[]) => pts.reduce((s, p, i) => (i ? s + km(pts[i - 1], p) : 0), 0);
const deg = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]);

type Edge = { a: number; b: number; pts: LngLat[]; len: number; bridge?: boolean };
/** A joined path, and how much of its length was digitised in the path's own direction (+) or against it (−). */
type Chain = { pts: LngLat[]; vote: number };

/** Douglas–Peucker in degrees; keeps the ends. */
function simplify(pts: LngLat[], tol: number): LngLat[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    const len = Math.hypot(bx - ax, by - ay) || 1e-12;
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len;
      if (d > worst) {
        worst = d;
        at = k;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Longest path through one connected piece: farthest node from anywhere, then the farthest node from that. */
function longestPath(nodes: number[], edges: Edge[]): Chain {
  const adj = new Map<number, { to: number; e: Edge }[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    adj.get(e.a)?.push({ to: e.b, e });
    adj.get(e.b)?.push({ to: e.a, e });
  }
  const search = (from: number) => {
    const dist = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, { node: number; e: Edge }>();
    const open = new Set([from]);
    while (open.size) {
      let cur = -1;
      let best = Infinity;
      for (const n of open) if (dist.get(n)! < best) [cur, best] = [n, dist.get(n)!];
      open.delete(cur);
      for (const { to, e } of adj.get(cur) ?? []) {
        const d = best + e.len;
        if (d < (dist.get(to) ?? Infinity)) {
          dist.set(to, d);
          prev.set(to, { node: cur, e });
          open.add(to);
        }
      }
    }
    let far = from;
    for (const [n, d] of dist) if (d > dist.get(far)!) far = n;
    return { far, prev };
  };
  const a = search(nodes[0]).far;
  const { far: b, prev } = search(a);
  // Walk back from b to a, then reverse so the path runs a → b.
  const out: LngLat[] = [];
  let vote = 0;
  let cur = b;
  while (cur !== a) {
    const step = prev.get(cur)!;
    // The path runs step.node → cur; an edge drawn a → b along it was digitised the path's way.
    const along = step.e.a === step.node && step.e.b === cur;
    if (!step.e.bridge) vote += along ? step.e.len : -step.e.len;
    const pts = step.e.a === cur ? step.e.pts : [...step.e.pts].reverse();
    for (const p of out.length ? pts.slice(1) : pts) out.push(p);
    cur = step.node;
  }
  return { pts: out.reverse(), vote };
}

/** Join every stretch of one river into separate connected paths, longest first. */
function chains(lines: LngLat[][]): Chain[] {
  const nodes: LngLat[] = [];
  const nodeAt = (p: LngLat) => {
    const i = nodes.findIndex((n) => deg(n, p) < JOIN);
    return i >= 0 ? i : nodes.push(p) - 1;
  };
  const edges: Edge[] = lines.map((pts) => ({ a: nodeAt(pts[0]), b: nodeAt(pts[pts.length - 1]), pts, len: lineKm(pts) }));
  const parent = nodes.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const e of edges) parent[root(e.a)] = root(e.b);
  // Bridge small gaps (a lake, a dam) between stretches.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (root(i) !== root(j) && deg(nodes[i], nodes[j]) < BRIDGE) {
        edges.push({ a: i, b: j, pts: [nodes[i], nodes[j]], len: km(nodes[i], nodes[j]), bridge: true });
        parent[root(i)] = root(j);
      }
    }
  }
  const groups = new Map<number, number[]>();
  nodes.forEach((_, i) => (groups.get(root(i)) ?? groups.set(root(i), []).get(root(i))!).push(i));
  return [...groups.values()]
    .map((members) => {
      const set = new Set(members);
      return longestPath(members, edges.filter((e) => set.has(e.a)));
    })
    .filter((c) => c.pts.length > 1)
    .sort((x, y) => lineKm(y.pts) - lineKm(x.pts));
}

/** Group pieces that lie within `apart` degrees of each other (single link); each group is one river. */
function namesakes(lines: LngLat[][], apart: number): LngLat[][][] {
  const close = (a: LngLat[], b: LngLat[]) => a.some((p) => b.some((q) => deg(p, q) < apart));
  const groups: LngLat[][][] = [];
  for (const line of lines) {
    const touching = groups.filter((g) => g.some((other) => close(line, other)));
    const merged = [line, ...touching.flat()];
    for (const g of touching) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups;
}

/** A coarse grid of points, for "is anything near here" questions. Points flagged `end` are ignored by near(). */
function grid(points: Iterable<{ p: LngLat; tag: string; end: boolean }>) {
  const cells = new Map<string, { p: LngLat; tag: string; end: boolean }[]>();
  const cell = (p: LngLat) => `${Math.floor(p[0])},${Math.floor(p[1])}`;
  for (const item of points) (cells.get(cell(item.p)) ?? cells.set(cell(item.p), []).get(cell(item.p))!).push(item);
  return {
    near(p: LngLat, tol: number, skip: string) {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const item of cells.get(`${Math.floor(p[0]) + dx},${Math.floor(p[1]) + dy}`) ?? [])
            if (!item.end && item.tag !== skip && deg(item.p, p) < tol) return true;
      return false;
    },
  };
}

function pointAlong(line: LngLat[], fromEnd: number): LngLat {
  let left = fromEnd;
  for (let i = line.length - 1; i > 0; i--) {
    const d = km(line[i], line[i - 1]);
    if (d >= left) {
      const k = left / d;
      return [line[i][0] + (line[i - 1][0] - line[i][0]) * k, line[i][1] + (line[i - 1][1] - line[i][1]) * k];
    }
    left -= d;
  }
  return line[0];
}

/**
 * @param coast  coastline points (lng, lat) used to tell a mouth from a source.
 * @param mouths known mouths by river name (lng, lat); they win over every other rule.
 */
export function buildRivers(fc: FeatureCollection<Geometry>, coast: LngLat[], mouths: Record<string, LngLat>): RiverLine[] {
  const byName = new Map<string, { rank: number; lines: LngLat[][] }>();
  for (const f of fc.features) {
    const props = (f.properties ?? {}) as { name?: string; name_en?: string; scalerank?: number };
    const name = (props.name_en || props.name || "").replace(/\s+/g, " ").trim();
    // Natural Earth files some canals (Suez, Ismailiya) as rivers; they have no source or mouth to flow between.
    if (!name || !f.geometry || /\bcanal\b/i.test(name)) continue;
    const parts =
      f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
    const entry = byName.get(name) ?? byName.set(name, { rank: Infinity, lines: [] }).get(name)!;
    entry.rank = Math.min(entry.rank, props.scalerank ?? 9);
    for (const part of parts) {
      const pts = part.map((c) => [c[0], c[1]] as LngLat).filter((p, i, all) => !i || deg(p, all[i - 1]) > 1e-9);
      if (pts.length > 1) entry.lines.push(pts);
    }
  }

  // Rivers that share a name come back as separate entries with the same name; the caller tells them apart.
  const rivers = [...byName]
    .flatMap(([name, { rank, lines }]) =>
      namesakes(lines, NAMESAKES[name] ?? NAMESAKE_DEG).map((group) => ({ name, rank, paths: chains(group) })),
    )
    .filter((r) => r.paths.length);
  // A river meets another where it touches the other's middle; touching the other's end (a tributary's mouth at the
  // start of a renamed stem) says nothing about direction.
  const touch = grid(
    rivers.flatMap((r) =>
      r.paths.flatMap(({ pts }) =>
        pts.map((p) => ({ p, tag: r.name, end: deg(p, pts[0]) < TOUCH * 3 || deg(p, pts[pts.length - 1]) < TOUCH * 3 })),
      ),
    ),
  );
  const coastDist = (p: LngLat) => coast.reduce((best, c) => Math.min(best, deg(p, c)), Infinity);

  /** True when the line should be reversed so that it ends at its mouth. */
  const flip = (name: string, { pts: line, vote }: Chain) => {
    const head = line[0];
    const tail = line[line.length - 1];
    const mouth = mouths[name];
    if (mouth) return deg(head, mouth) < deg(tail, mouth);
    const ch = coast.length ? coastDist(head) : Infinity;
    const ct = coast.length ? coastDist(tail) : Infinity;
    if (ch < SEA && ct > INLAND) return true;
    if (ct < SEA && ch > INLAND) return false;
    const hit = (p: LngLat) => touch.near(p, TOUCH, name);
    if (hit(head) !== hit(tail)) return hit(head);
    if (vote) return vote < 0;
    return ch < ct;
  };

  return rivers.map(({ name, rank, paths }) => {
    const lines = paths
      .filter((c, i) => i === 0 || lineKm(c.pts) >= MIN_BRANCH_KM)
      .map((c) => simplify(flip(name, c) ? [...c.pts].reverse() : c.pts, SIMPLIFY));
    const length = lineKm(lines[0]);
    return { name, rank, lines, km: length, gauges: GAUGES.map((f) => pointAlong(lines[0], length * f)) };
  });
}
