import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssets } from "./assets.ts";
import { eq } from "./cartogram.ts";

const area = (ring: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = eq(...ring[i]);
    const q = eq(...ring[(i + 1) % ring.length]);
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
};

test("the Nile runs north to its mouth and belongs to its hub", async () => {
  const { rivers } = await buildAssets();
  const nile = rivers.rivers.find((r) => r.name === "Nile");
  assert.ok(nile, "no Nile");
  assert.equal(nile.hub, "nile");
  const real = nile.lines[0].real;
  assert.ok(real[1] < real[real.length - 1], `starts at lat ${real[1]}, ends at ${real[real.length - 1]}`);
  assert.equal(nile.lines[0].dist[0], 0);
});

test("Egypt grows and Russia shrinks when inflated", async () => {
  const { inflate } = await buildAssets();
  const total = (name: string, key: "real" | "inflated") =>
    inflate.countries.find((c) => c.name === name)![key].reduce((s, ring) => s + area(ring), 0);
  assert.ok(total("Egypt", "inflated") > total("Egypt", "real") * 1.5);
  assert.ok(total("Russia", "inflated") < total("Russia", "real") * 0.7);
});

test("pins have inflated positions", async () => {
  const { inflate } = await buildAssets();
  assert.ok(inflate.points["hub:nile"], "hub:nile");
  assert.ok(inflate.points["node:p-egypt"], "node:p-egypt");
});
