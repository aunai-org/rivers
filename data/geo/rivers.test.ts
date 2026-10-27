import { test } from "node:test";
import assert from "node:assert/strict";
import type { FeatureCollection, Geometry } from "geojson";
import { buildRivers, km } from "./rivers.ts";

type Line = [number, number][];
const fc = (rows: { name: string; lines: Line[] }[]): FeatureCollection<Geometry> => ({
  type: "FeatureCollection",
  features: rows.flatMap((r) =>
    r.lines.map((coordinates) => ({
      type: "Feature" as const,
      properties: { name: r.name, name_en: r.name, scalerank: 3 },
      geometry: { type: "LineString" as const, coordinates },
    })),
  ),
});

/** A straight run of points, 0.5° apart, from a to b. */
function run(a: [number, number], b: [number, number]): Line {
  const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
  return Array.from({ length: steps + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
}

const near = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;

test("chains fragments into one stem", () => {
  // A → B, and C → B digitised the wrong way: one river A…C.
  const out = buildRivers(fc([{ name: "Test", lines: [run([0, 0], [5, 0]), run([10, 0], [5, 0])] }]), [], {});
  assert.equal(out.length, 1);
  const stem = out[0].lines[0];
  const ends = [stem[0], stem[stem.length - 1]];
  assert.ok(ends.some((e) => near(e, [0, 0])) && ends.some((e) => near(e, [10, 0])), `ends ${JSON.stringify(ends)}`);
});

test("orients to known mouth", () => {
  const out = buildRivers(fc([{ name: "Test", lines: [run([0, 0], [10, 0])] }]), [], { Test: [0, 0] });
  const stem = out[0].lines[0];
  assert.ok(near(stem[stem.length - 1], [0, 0]));
});

test("orients to coast when no mouth", () => {
  const out = buildRivers(fc([{ name: "Test", lines: [run([0, 0], [10, 0])] }]), [[10.3, 0]], {});
  const stem = out[0].lines[0];
  assert.ok(near(stem[stem.length - 1], [10, 0]));
});

test("confluence beats coast", () => {
  // Tributary T runs from (0,5) to (5,0), where it meets the trunk; the coast is next to its source.
  const out = buildRivers(
    fc([
      { name: "Trunk", lines: [run([0, -5], [5, 0]), run([5, 0], [20, 0])] },
      { name: "Trib", lines: [run([5, 0], [0, 5])] },
    ]),
    [[-1, 5], [20.2, 0]],
    {},
  );
  const trib = out.find((r) => r.name === "Trib")!.lines[0];
  assert.ok(near(trib[trib.length - 1], [5, 0]), `trib ends at ${trib[trib.length - 1]}`);
});

test("gauges sit near the mouth", () => {
  const out = buildRivers(fc([{ name: "Test", lines: [run([0, 0], [20, 0])] }]), [], { Test: [20, 0] });
  const r = out[0];
  assert.equal(r.gauges.length, 3);
  const mouth = r.lines[0][r.lines[0].length - 1];
  for (const g of r.gauges) assert.ok(km(g, mouth) <= r.km * 0.12, `gauge ${g} is ${km(g, mouth)} km from the mouth`);
});

test("same-name duplicates do not double the length", () => {
  const line = run([0, 0], [10, 0]);
  const out = buildRivers(fc([{ name: "Test", lines: [line, [...line]] }]), [], {});
  const expected = km([0, 0], [10, 0]);
  assert.ok(Math.abs(out[0].km - expected) < expected * 0.02, `km ${out[0].km} vs ${expected}`);
});

test("meeting a tributary's mouth does not make a mouth", () => {
  // Main stem M starts where tributary T ends (T flows into M's first point); M runs on to the sea at (20,0).
  const out = buildRivers(
    fc([
      { name: "Main", lines: [run([20, 0], [5, 0])] },
      { name: "Trib", lines: [run([0, 5], [5, 0])] },
    ]),
    [[20.2, 0]],
    {},
  );
  const main = out.find((r) => r.name === "Main")!.lines[0];
  assert.ok(near(main[main.length - 1], [20, 0]), `main ends at ${main[main.length - 1]}`);
});

test("falls back to the digitised direction", () => {
  // No mouth, no coast, no other river: keep the direction most of the length was drawn in.
  const out = buildRivers(fc([{ name: "Test", lines: [run([10, 0], [5, 0]), run([5, 0], [0, 0]), run([0, 0], [-1, 0])] }]), [], {});
  const stem = out[0].lines[0];
  assert.ok(near(stem[stem.length - 1], [-1, 0]), `ends at ${stem[stem.length - 1]}`);
});
