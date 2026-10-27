/**
 * The "inflated by river" map: a contiguous area cartogram, ported from the dashboard (dashboard/page.html).
 *
 * Every country is projected with Equal Earth (an equal-area projection, so planar area is true area), then every
 * vertex is pushed by each country's size error (Dougenik rubber-sheet) until areas follow the wanted weights. The
 * result is fitted back onto the original extent and converted back to longitude/latitude, so it can sit on a globe.
 * Extra points (river mouths, country centres, river vertices) ride the same displacement field without weight.
 */

export type LngLat = [lng: number, lat: number];

/** One country. `want` is its weight (river km); `null` keeps it out of the table and squeezes it to 35%. */
export type Region = { name: string; want: number | null; rings: { hole: boolean; ll: LngLat[] }[] };

export type Inflated = {
  /** Per region, per ring: inflated longitude/latitude, in the same order as the input. */
  rings: LngLat[][][];
  /** The extra points, moved by the same field. */
  extra: LngLat[];
};

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const RAD = Math.PI / 180;
/** Countries outside the table keep this share of their area. */
const SQUEEZE = 0.35;
/** Table countries share this much more room than their land, so the change reads at a glance. */
const ROOM = 1.8;

/** Equal Earth, in radians-scale units. */
export function eq(lon: number, lat: number): [number, number] {
  const th = Math.asin((Math.sqrt(3) / 2) * Math.sin(lat * RAD));
  const t2 = th * th;
  const t6 = t2 * t2 * t2;
  return [
    (2 * Math.sqrt(3) * lon * RAD * Math.cos(th)) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  ];
}

export function invEq(x: number, y: number): LngLat {
  let th = y / A1;
  for (let i = 0; i < 12; i++) {
    const t2 = th * th;
    const t6 = t2 * t2 * t2;
    th -= (th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y) / (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2));
  }
  th = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, th));
  const t2 = th * th;
  const t6 = t2 * t2 * t2;
  const lat = Math.asin(Math.max(-1, Math.min(1, (2 * Math.sin(th)) / Math.sqrt(3)))) / RAD;
  const lon = (3 * x * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))) / (2 * Math.sqrt(3) * Math.cos(th)) / RAD;
  return [Math.max(-180, Math.min(180, lon)), lat];
}

/** A ring as a slice [start, end) of the flat point buffer. */
type Span = { start: number; end: number; hole: boolean };

/** Signed area of a span, and its area-weighted centre (outer rings only). */
function ringStats(xy: Float64Array, s: Span) {
  let a = 0;
  let sx = 0;
  let sy = 0;
  for (let i = s.start; i < s.end; i++) {
    const j = i + 1 < s.end ? i + 1 : s.start;
    const px = xy[2 * i];
    const py = xy[2 * i + 1];
    const qx = xy[2 * j];
    const qy = xy[2 * j + 1];
    const cr = px * qy - qx * py;
    a += cr;
    sx += (px + qx) * cr;
    sy += (py + qy) * cr;
  }
  a /= 2;
  return { a, cx: a ? sx / (6 * a) : 0, cy: a ? sy / (6 * a) : 0 };
}

export function inflate(regions: Region[], extra: LngLat[], iters = 14): Inflated {
  // Flatten every ring and the extra points into one buffer of projected coordinates.
  let count = extra.length;
  for (const g of regions) for (const r of g.rings) count += r.ll.length;
  const xy = new Float64Array(count * 2);
  const spans: Span[][] = [];
  let n = 0;
  const put = (p: LngLat) => {
    const [x, y] = eq(p[0], p[1]);
    xy[2 * n] = x;
    xy[2 * n + 1] = y;
    n++;
  };
  for (const g of regions) {
    spans.push(
      g.rings.map((r) => {
        const start = n;
        r.ll.forEach(put);
        return { start, end: n, hole: r.hole };
      }),
    );
  }
  const extraStart = n;
  extra.forEach(put);

  const stats = (i: number) => {
    let area = 0;
    let ao = 0;
    let cx = 0;
    let cy = 0;
    for (const s of spans[i]) {
      const st = ringStats(xy, s);
      const aa = Math.abs(st.a);
      area += s.hole ? -aa : aa;
      if (s.hole || !st.a) continue;
      cx += st.cx * aa;
      cy += st.cy * aa;
      ao += aa;
    }
    return { area: Math.max(area, 1e-9), cx: ao ? cx / ao : 0, cy: ao ? cy / ao : 0 };
  };

  // Wanted areas: table countries share ROOM× their combined land by river length; the rest shrink.
  const area0 = regions.map((_, i) => stats(i).area);
  let usedArea = 0;
  let usedKm = 0;
  regions.forEach((g, i) => {
    if (g.want !== null) {
      usedArea += area0[i];
      usedKm += g.want;
    }
  });
  const lam = usedKm ? (ROOM * usedArea) / usedKm : 0;
  const want = regions.map((g, i) => (g.want !== null ? g.want * lam : area0[i] * SQUEEZE));

  // Original extent, so the result can be fitted back onto it.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < extraStart; i++) {
    x0 = Math.min(x0, xy[2 * i]);
    x1 = Math.max(x1, xy[2 * i]);
    y0 = Math.min(y0, xy[2 * i + 1]);
    y1 = Math.max(y1, xy[2 * i + 1]);
  }

  const k = regions.length;
  const CX = new Float64Array(k);
  const CY = new Float64Array(k);
  const RD = new Float64Array(k);
  const M = new Float64Array(k);
  for (let it = 0; it < iters; it++) {
    let total = 0;
    let wanted = 0;
    const st = regions.map((_, i) => stats(i));
    for (let i = 0; i < k; i++) {
      total += st[i].area;
      wanted += want[i];
    }
    let err = 0;
    for (let i = 0; i < k; i++) {
      const d = (want[i] * total) / wanted;
      const a = st[i].area;
      CX[i] = st[i].cx;
      CY[i] = st[i].cy;
      RD[i] = Math.sqrt(a / Math.PI);
      M[i] = Math.sqrt(d / Math.PI) - RD[i];
      err += Math.max(a, d) / Math.min(a, d);
    }
    const reduce = 1 / (1 + err / k);
    for (let p = 0; p < n; p++) {
      const px = xy[2 * p];
      const py = xy[2 * p + 1];
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < k; i++) {
        const ex = px - CX[i];
        const ey = py - CY[i];
        const dist = Math.sqrt(ex * ex + ey * ey) || 1e-9;
        const x = dist / RD[i];
        const f = dist > RD[i] ? M[i] / x : M[i] * x * x * (4 - 3 * x);
        dx += (f * ex) / dist;
        dy += (f * ey) / dist;
      }
      xy[2 * p] = px + dx * reduce;
      xy[2 * p + 1] = py + dy * reduce;
    }
  }

  // Fit the stretched map back onto the original extent, then read it as longitude/latitude.
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (let i = 0; i < extraStart; i++) {
    u0 = Math.min(u0, xy[2 * i]);
    u1 = Math.max(u1, xy[2 * i]);
    v0 = Math.min(v0, xy[2 * i + 1]);
    v1 = Math.max(v1, xy[2 * i + 1]);
  }
  const back = (p: number): LngLat =>
    invEq(x0 + ((xy[2 * p] - u0) / (u1 - u0 || 1)) * (x1 - x0), y0 + ((xy[2 * p + 1] - v0) / (v1 - v0 || 1)) * (y1 - y0));
  const range = (s: Span) => Array.from({ length: s.end - s.start }, (_, i) => back(s.start + i));
  return {
    rings: spans.map((list) => list.map(range)),
    extra: Array.from({ length: extra.length }, (_, i) => back(extraStart + i)),
  };
}
