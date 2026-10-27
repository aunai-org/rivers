import * as THREE from "three";
import { feature } from "topojson-client";
import { geoEquirectangular, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import world from "world-atlas/countries-110m.json";
import type { Topology } from "topojson-specification";
import type { InflateAsset } from "./data";
import { THEME } from "./theme";

const W = 2048;
const H = 1024;

/** River-length bands for the inflated colours, km. Same bands as the dashboard. */
export const BANDS = [1000, 2000, 3500, 5000];
export const BAND_LABELS = ["< 1,000 km", "1,000–2,000", "2,000–3,500", "3,500–5,000", "5,000 km +"];
/** How much of the band colour each band gets over the land grey. */
const BAND_MIX = [0.22, 0.4, 0.6, 0.8, 1];

const rgb = (css: string) => [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export const bandOf = (km: number) => BANDS.filter((b) => km >= b).length;
const bandRgb = (km: number) => mix(rgb(THEME.earth.land[3]), rgb(THEME.river), BAND_MIX[bandOf(km)]);
/** The colour a table country takes when fully inflated. */
export const bandColour = (km: number): string => css(bandRgb(km));

/** One ring ready to draw: longitudes unwrapped so they never jump ±360, and the shifts that bring spill-over back. */
type Ring = { a: number[][]; b: number[][]; shifts: number[] };

/**
 * Natural Earth cuts rings at the antimeridian, but some still step from +180 to −180 (Russia, Fiji), which on a
 * flat map is a line across the whole world. Unwrap each ring so it is continuous, then draw it once more, a world
 * to the left or right, where it runs past the edge. The inflated ring follows its real ring's unwrapping.
 */
function unwrap(real: number[][], inflated: number[][]): Ring {
  const a: number[][] = [];
  const b: number[][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < real.length; i++) {
    let x = real[i][0];
    if (i) while (x - a[i - 1][0] > 180) x -= 360;
    if (i) while (x - a[i - 1][0] < -180) x += 360;
    let y = inflated[i][0];
    while (y - x > 180) y -= 360;
    while (y - x < -180) y += 360;
    a.push([x, real[i][1]]);
    b.push([y, inflated[i][1]]);
    lo = Math.min(lo, x, y);
    hi = Math.max(hi, x, y);
  }
  const shifts = [0];
  if (lo < -180) shifts.push(360);
  if (hi > 180) shifts.push(-360);
  return { a, b, shifts };
}

/**
 * Paints the globe's surface. Until the inflated shapes arrive it draws the plain map with d3 (as before); after
 * that it can draw any point between the real outlines (t = 0) and the river-inflated ones (t = 1).
 */
export class EarthPainter {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private shapes: { km: number | null; rings: Ring[] }[] | null = null;
  private last = NaN;

  constructor(renderer: THREE.WebGLRenderer) {
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.plain();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  }

  get ready() {
    return this.shapes !== null;
  }

  setShapes(asset: InflateAsset) {
    this.shapes = asset.countries.map((c) => ({ km: c.km, rings: c.real.map((ring, r) => unwrap(ring, c.inflated[r])) }));
    this.last = NaN;
  }

  /** Draw the morph at t (it may overshoot 1 while the elastic ease settles). Skips repeat work. */
  paint(t: number) {
    if (!this.shapes || t === this.last) return;
    this.last = t;
    const ctx = this.ctx;
    ctx.fillStyle = THEME.earth.sea;
    ctx.fillRect(0, 0, W, H);
    const land = THEME.earth.land;
    const k = Math.max(0, Math.min(1, t));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = THEME.earth.border;
    ctx.lineJoin = "round";
    this.shapes.forEach((c, i) => {
      ctx.beginPath();
      for (const { a, b, shifts } of c.rings) {
        for (const shift of shifts) {
          for (let p = 0; p < a.length; p++) {
            const lng = a[p][0] + (b[p][0] - a[p][0]) * t + shift;
            const lat = a[p][1] + (b[p][1] - a[p][1]) * t;
            const x = ((lng + 180) / 360) * W;
            const y = ((90 - Math.max(-90, Math.min(90, lat))) / 180) * H;
            if (p) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.closePath();
        }
      }
      const base = land[i % land.length];
      ctx.fillStyle = c.km === null || !k ? base : css(mix(rgb(base), bandRgb(c.km), k));
      ctx.fill("evenodd");
      ctx.stroke();
    });
    this.texture.needsUpdate = true;
  }

  /** The original look: d3 handles the antimeridian and the poles on the sphere. */
  private plain() {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.earth.sea;
    ctx.fillRect(0, 0, W, H);
    const topology = world as unknown as Topology;
    const countries = feature(topology, topology.objects.countries) as FeatureCollection<Geometry>;
    const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    const path = geoPath(projection, ctx);
    const land = THEME.earth.land;
    countries.features.forEach((country, i) => {
      ctx.beginPath();
      path(country);
      ctx.fillStyle = land[i % land.length];
      ctx.fill();
      ctx.strokeStyle = THEME.earth.border;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    });
  }
}
