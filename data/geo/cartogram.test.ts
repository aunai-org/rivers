import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, invEq, inflate, type Region } from "./cartogram.ts";

const square = (lon: number, lat: number, half: number): [number, number][] => [
  [lon - half, lat - half],
  [lon + half, lat - half],
  [lon + half, lat + half],
  [lon - half, lat + half],
];

/** Shoelace area of a ring after projecting it with Equal Earth. */
function projectedArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = eq(...ring[i]);
    const q = eq(...ring[(i + 1) % ring.length]);
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

function inside(pt: [number, number], ring: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

test("round trip", () => {
  for (const [lon, lat] of [
    [0, 0],
    [120, 45],
    [-170, -60],
  ] as const) {
    const [x, y] = eq(lon, lat);
    const [lon2, lat2] = invEq(x, y);
    assert.ok(Math.abs(lon2 - lon) < 1e-6, `lon ${lon} → ${lon2}`);
    assert.ok(Math.abs(lat2 - lat) < 1e-6, `lat ${lat} → ${lat2}`);
  }
});

const regions = (): Region[] => [
  { name: "small", want: 1, rings: [{ hole: false, ll: square(-10, 0, 5) }] },
  { name: "big", want: 4, rings: [{ hole: false, ll: square(10, 0, 5) }] },
];

test("areas move toward targets", () => {
  const out = inflate(regions(), []);
  const ratio = projectedArea(out.rings[1][0]) / projectedArea(out.rings[0][0]);
  assert.ok(ratio > 2, `ratio ${ratio}`);
});

test("extra points move with their region", () => {
  const out = inflate(regions(), [[10, 0]]);
  assert.ok(inside(out.extra[0], out.rings[1][0]), `point ${out.extra[0]} left its region`);
});
