import { test } from "node:test";
import assert from "node:assert/strict";
import { riversShown } from "./select.ts";

const rivers = [
  { name: "Nile", countries: ["Sudan", "Egypt"] },
  { name: "Congo", countries: ["DR Congo", "Congo"] },
  { name: "Atbara", countries: ["Ethiopia", "Sudan"] },
];

test("nothing selected shows every river", () => {
  assert.equal(riversShown(rivers, {}), null);
});

test("a selected river shows only that river", () => {
  assert.deepEqual([...riversShown(rivers, { river: "Congo" })!], [1]);
});

test("a selected country shows the rivers that cross it", () => {
  assert.deepEqual([...riversShown(rivers, { country: "Sudan" })!].sort(), [0, 2]);
});

test("a river picked inside a country wins over the country", () => {
  assert.deepEqual([...riversShown(rivers, { country: "Sudan", river: "Atbara" })!], [2]);
});

test("a country with no rivers shows none, not all", () => {
  assert.equal(riversShown(rivers, { country: "Iceland" })!.size, 0);
});
