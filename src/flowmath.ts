/**
 * Geometry and scales for the flowing-river layer, kept free of three.js so they can be tested in Node.
 *
 * Each river line becomes a ribbon lying on the sphere: two vertices per point, pushed apart sideways (along the
 * surface, square to the river) by the shader. Every vertex carries both its real and its river-inflated position,
 * so the ribbon follows the land when the map is inflated.
 */

export type RibbonLine = { real: number[]; inflated: number[]; dist: number[] };
export type RibbonRiver = { lines: RibbonLine[]; rank: number };

export type Ribbon = {
  /** Real and inflated positions (x, y, z), and the unit sideways direction at each. */
  p0: Float32Array;
  p1: Float32Array;
  o0: Float32Array;
  o1: Float32Array;
  /** −1 or +1: which bank of the ribbon. */
  side: Float32Array;
  /** km from the line's source. */
  dist: Float32Array;
  /** Index of the river each vertex belongs to. */
  river: Float32Array;
  index: Uint32Array;
};

const RAD = Math.PI / 180;

/** The same mapping as the globe's toVector(): latitude/longitude in degrees to a point on a sphere. */
function vec(lng: number, lat: number, r: number): [number, number, number] {
  const a = lat * RAD;
  const b = lng * RAD;
  return [r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)];
}

/** Unit vector along the surface, square to the line at point i. */
function sideways(pts: [number, number, number][], i: number): [number, number, number] {
  const a = pts[Math.max(i - 1, 0)];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const n = pts[i];
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  let tz = b[2] - a[2];
  if (!tx && !ty && !tz) [tx, ty, tz] = [-n[2], 0, n[0]];
  // normal × tangent lies in the surface, square to the river.
  const x = n[1] * tz - n[2] * ty;
  const y = n[2] * tx - n[0] * tz;
  const z = n[0] * ty - n[1] * tx;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function ribbon(rivers: RibbonRiver[], radius: number): Ribbon {
  let points = 0;
  let segments = 0;
  for (const r of rivers)
    for (const l of r.lines) {
      points += l.dist.length;
      segments += Math.max(l.dist.length - 1, 0);
    }
  const out: Ribbon = {
    p0: new Float32Array(points * 6),
    p1: new Float32Array(points * 6),
    o0: new Float32Array(points * 6),
    o1: new Float32Array(points * 6),
    side: new Float32Array(points * 2),
    dist: new Float32Array(points * 2),
    river: new Float32Array(points * 2),
    index: new Uint32Array(segments * 6),
  };
  let v = 0;
  let k = 0;
  rivers.forEach((r, ri) => {
    for (const l of r.lines) {
      const n = l.dist.length;
      const real = Array.from({ length: n }, (_, i) => vec(l.real[2 * i], l.real[2 * i + 1], radius));
      const inflated = Array.from({ length: n }, (_, i) => vec(l.inflated[2 * i], l.inflated[2 * i + 1], radius));
      const first = v;
      for (let i = 0; i < n; i++) {
        const s0 = sideways(real, i);
        const s1 = sideways(inflated, i);
        for (const side of [-1, 1]) {
          out.p0.set(real[i], v * 3);
          out.p1.set(inflated[i], v * 3);
          out.o0.set(s0, v * 3);
          out.o1.set(s1, v * 3);
          out.side[v] = side;
          out.dist[v] = l.dist[i];
          out.river[v] = ri;
          v++;
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const a = first + i * 2;
        out.index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k);
        k += 6;
      }
    }
  });
  return out;
}

/** How fast pulses run downstream, km per second of animation, from discharge in m³/s. */
export function flowSpeed(q: number | null): number {
  return q === null ? 320 : 160 + 110 * Math.log10(Math.max(q, 1));
}

/** Ribbon width in world units: bigger rivers by rank, then by today's discharge when it is known. */
export function flowWidth(q: number | null, rank: number): number {
  const byRank = 0.0048 + Math.max(0, 6 - rank) * 0.0011;
  if (q === null) return byRank;
  return byRank * (0.55 + 0.22 * Math.log10(Math.max(q, 1)));
}
