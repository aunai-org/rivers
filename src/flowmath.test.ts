import { test } from "node:test";
import assert from "node:assert/strict";
import { flowSpeed, flowWidth, ribbon } from "./flowmath.ts";

const line = (n: number) => ({
  real: Array.from({ length: n }, (_, i) => [i, 0]).flat(),
  inflated: Array.from({ length: n }, (_, i) => [i, 1]).flat(),
  dist: Array.from({ length: n }, (_, i) => i * 111),
});

test("two vertices per point and six indices per segment", () => {
  const r = ribbon([{ lines: [line(5), line(3)], rank: 2 }], 1.5);
  assert.equal(r.p0.length / 3, (5 + 3) * 2);
  assert.equal(r.index.length, (4 + 2) * 6);
  assert.equal(r.river.length, (5 + 3) * 2);
});

test("vertices sit on the sphere and sides are opposite", () => {
  const r = ribbon([{ lines: [line(3)], rank: 1 }], 2);
  const len = Math.hypot(r.p0[0], r.p0[1], r.p0[2]);
  assert.ok(Math.abs(len - 2) < 1e-6, `radius ${len}`);
  assert.equal(r.side[0], -1);
  assert.equal(r.side[1], 1);
  // The offset is perpendicular to the surface normal.
  const dot = r.o0[0] * r.p0[0] + r.o0[1] * r.p0[1] + r.o0[2] * r.p0[2];
  assert.ok(Math.abs(dot) < 1e-6, `offset · normal = ${dot}`);
});

test("distance runs along each line from its source", () => {
  const r = ribbon([{ lines: [line(3)], rank: 1 }], 1);
  assert.deepEqual(Array.from(r.dist), [0, 0, 111, 111, 222, 222]);
});

test("bigger discharge flows faster and wider", () => {
  assert.ok(flowSpeed(100_000) > flowSpeed(100));
  assert.ok(flowWidth(100_000, 3) > flowWidth(100, 3));
  assert.ok(flowWidth(null, 1) > flowWidth(null, 6), "rank sets the width without data");
});
