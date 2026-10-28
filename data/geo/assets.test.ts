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

test("rivers list the countries they cross, in the table's spelling", async () => {
  const { rivers } = await buildAssets();
  const crosses = (name: string) => rivers.rivers.find((r) => r.name === name)?.countries ?? [];
  assert.ok(crosses("Nile").includes("Egypt") && crosses("Nile").includes("Sudan"), `Nile: ${crosses("Nile")}`);
  assert.ok(crosses("Amazon").includes("Brazil"), `Amazon: ${crosses("Amazon")}`);
  assert.ok(crosses("Mississippi").includes("United States"), `Mississippi: ${crosses("Mississippi")}`);
  assert.ok(!crosses("Nile").includes("Brazil"));
});

test("namesake rivers get their country in the name, and only their own countries", async () => {
  const { rivers } = await buildAssets();
  const names = rivers.rivers.map((r) => r.name);
  assert.equal(new Set(names).size, names.length, "every river name is unique");
  const us = rivers.rivers.find((r) => r.name === "Colorado (United States)");
  const ar = rivers.rivers.find((r) => r.name === "Colorado (Argentina)");
  assert.ok(us && ar, `Colorados: ${names.filter((n) => n.startsWith("Colorado"))}`);
  assert.ok(!us.countries.includes("Argentina"), `US Colorado crosses ${us.countries}`);
  assert.deepEqual(ar.countries, ["Argentina"]);
  assert.ok(names.includes("Negro (Brazil)") && names.includes("Negro (Argentina)"), "Río Negro and Rio Negro");
});

test("pins have inflated positions", async () => {
  const { inflate } = await buildAssets();
  assert.ok(inflate.points["hub:nile"], "hub:nile");
  assert.ok(inflate.points["node:p-egypt"], "node:p-egypt");
});
