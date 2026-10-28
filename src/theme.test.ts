import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENE, initialMode } from "./theme.ts";

test("a saved choice wins; otherwise the system setting picks the mode", () => {
  assert.equal(initialMode("light", true), "light");
  assert.equal(initialMode("dark", false), "dark");
  assert.equal(initialMode(null, false), "light");
  assert.equal(initialMode(null, true), "dark");
  assert.equal(initialMode("purple", true), "dark", "junk in storage is ignored");
});

const luma = (css: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test("both modes have five river bands that run from short to long", () => {
  for (const mode of ["dark", "light"] as const) {
    assert.equal(SCENE[mode].bands.length, 5, mode);
    assert.equal(new Set(SCENE[mode].bands).size, 5, `${mode} bands are distinct`);
  }
  // Dark mode brightens with length; light mode deepens.
  const dark = SCENE.dark.bands.map(luma);
  const light = SCENE.light.bands.map(luma);
  assert.ok(dark.every((v, i) => !i || v > dark[i - 1]), "dark bands get brighter");
  assert.ok(light.every((v, i) => !i || v < light[i - 1]), "light bands get deeper");
});

test("light mode is light: pale sea and land, darker rivers", () => {
  const L = SCENE.light;
  assert.ok(luma(L.sea) > 170);
  assert.ok(L.land.every((c) => luma(c) > luma(L.sea)), "land is paler than the sea");
  assert.ok(luma(L.river) < luma(L.sea) - 60, "rivers stand out against the sea");
});

test("light-mode pulses stand out from the blue river: a warm head", () => {
  const [r, , b] = [1, 3, 5].map((i) => parseInt(SCENE.light.head.slice(i, i + 2), 16));
  assert.ok(r > b + 60, `head ${SCENE.light.head} is not warm`);
  assert.ok(luma(SCENE.light.head) < luma(SCENE.light.land[0]) - 50, "and still shows on pale land");
});

test("the light sky is a muted backdrop, darker than the globe it frames", () => {
  const L = SCENE.light;
  assert.ok(luma(L.sky) < luma(L.sea) - 15, "the globe stands out against the sky");
  assert.ok(luma(L.sky) < 200, "the sky is not glaring");
  assert.ok(luma(L.sky) > 120, "it is still a light mode");
});
