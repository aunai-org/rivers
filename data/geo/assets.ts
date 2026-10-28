import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { geoBounds, geoContains } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { FeatureCollection, Geometry, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import type { InflateAsset, RiversAsset } from "../../src/data.ts";
import { CENTRE, MOUTH, readRows, slug } from "../build.ts";
import { inflate, type LngLat, type Region } from "./cartogram.ts";
import { buildRivers, km } from "./rivers.ts";

/**
 * The two geometry files the globe loads besides data.json:
 *   /inflate.json  every country's real and river-inflated outline, and where each pin moves when inflated;
 *   /rivers.json   Natural Earth rivers, source → mouth, with real and inflated positions and distance along.
 * Built once per process (the dev server and `vite build` both call buildAssets()).
 */

const require = createRequire(import.meta.url);
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** Country names in data/rivers.csv that world-atlas spells differently. */
const COUNTRY_ALIAS: Record<string, string> = { "United States": "United States of America", "DR Congo": "Dem. Rep. Congo" };
/** world-atlas names back to the table's spelling, so the app can match rivers to its countries. */
const TABLE_NAME = Object.fromEntries(Object.entries(COUNTRY_ALIAS).map(([table, atlas]) => [atlas, table]));
/** Table rivers whose Natural Earth line has another name. */
const RIVER_ALIAS: Record<string, string> = {
  "Ob-Irtysh": "Ob",
  "Missouri-Mississippi": "Mississippi",
  "Murray-Darling": "Murray",
  Amazon: "Amazonas",
  Parana: "Paraná",
};
/** Natural Earth names shown under a better-known one. */
const DISPLAY: Record<string, string> = { Amazonas: "Amazon", Huang: "Huang He" };

const round = (n: number) => Math.round(n * 1000) / 1000;
const pair = (p: LngLat): LngLat => [round(p[0]), round(p[1])];

let built: Promise<{ inflate: InflateAsset; rivers: RiversAsset }> | null = null;

export function buildAssets() {
  built ??= Promise.resolve().then(make);
  return built;
}

function make(): { inflate: InflateAsset; rivers: RiversAsset } {
  const rows = readRows();
  const kmByCountry = new Map(rows.map((r) => [COUNTRY_ALIAS[r.country] ?? r.country, r.km]));

  // Countries: world-atlas outlines, weighted by their longest river.
  const world = json<Topology>(require.resolve("world-atlas/countries-110m.json"));
  const countries = (feature(world, world.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;
  const regions: Region[] = countries.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    return {
      name: f.properties.name,
      want: kmByCountry.get(f.properties.name) ?? null,
      rings: polys.flatMap((poly) => poly.map((ring, i) => ({ hole: i > 0, ll: ring.map((c) => [c[0], c[1]] as LngLat) }))),
    };
  });

  // Rivers: Natural Earth 50m, oriented with the table's known mouths and the 50m coastline.
  const mouths: Record<string, LngLat> = {};
  for (const [river, [lat, lng]] of Object.entries(MOUTH)) mouths[RIVER_ALIAS[river] ?? river] = [lng, lat];
  const land = json<Topology>(require.resolve("world-atlas/land-50m.json"));
  const coast = (mesh(land, land.objects.land as Parameters<typeof mesh>[1]) as MultiLineString).coordinates.flat().map((c) => [c[0], c[1]] as LngLat);
  const source = fileURLToPath(new URL("../ne_50m_rivers_lake_centerlines.geojson", import.meta.url));
  const lines = buildRivers(json<FeatureCollection<Geometry>>(source), coast, mouths);
  const hubOf = new Map<string, string>();
  for (const r of rows) hubOf.set(RIVER_ALIAS[r.river] ?? r.river, slug(r.river));

  // Which countries each river crosses, in order from source to mouth. Two vertices inside a country count as a crossing.
  const boxes = countries.map((f) => geoBounds(f));
  const inBox = (i: number, [x, y]: LngLat) => {
    const [[x0, y0], [x1, y1]] = boxes[i];
    return y >= y0 && y <= y1 && (x0 <= x1 ? x >= x0 && x <= x1 : x >= x0 || x <= x1);
  };
  const crossed = (r: (typeof lines)[number]): string[] => {
    const first = new Map<string, number>();
    const hits = new Map<string, number>();
    let n = 0;
    for (const line of r.lines) {
      for (const p of line) {
        n++;
        const i = countries.findIndex((f, c) => inBox(c, p) && geoContains(f, p));
        if (i < 0) continue;
        const name = TABLE_NAME[countries[i].properties.name] ?? countries[i].properties.name;
        hits.set(name, (hits.get(name) ?? 0) + 1);
        if (!first.has(name)) first.set(name, n);
      }
    }
    return [...first].filter(([name]) => hits.get(name)! >= 2).sort((x, y) => x[1] - y[1]).map(([name]) => name);
  };
  // The table says which country each of its rivers belongs to, even where a coarse border misses it.
  const tableCountries = new Map<string, string[]>();
  for (const r of rows) {
    const key = RIVER_ALIAS[r.river] ?? r.river;
    (tableCountries.get(key) ?? tableCountries.set(key, []).get(key)!).push(r.country);
  }

  // Pins and every river vertex ride the cartogram's displacement field.
  const pinKeys: string[] = [];
  const extra: LngLat[] = [];
  const seenHub = new Set<string>();
  for (const r of rows) {
    const hub = slug(r.river);
    if (!seenHub.has(hub)) {
      seenHub.add(hub);
      pinKeys.push(`hub:${hub}`);
      extra.push([MOUTH[r.river][1], MOUTH[r.river][0]]);
    }
    pinKeys.push(`node:p-${slug(r.country)}`);
    extra.push([CENTRE[r.country][1], CENTRE[r.country][0]]);
  }
  const riverStart = extra.length;
  for (const r of lines) for (const line of r.lines) extra.push(...line);

  const out = inflate(regions, extra);

  const points: InflateAsset["points"] = {};
  pinKeys.forEach((key, i) => (points[key] = [round(out.extra[i][1]), round(out.extra[i][0])]));

  let at = riverStart;
  const rivers: RiversAsset["rivers"] = lines.map((r) => ({
    name: DISPLAY[r.name] ?? r.name,
    km: Math.round(r.km),
    rank: r.rank,
    ...(hubOf.has(r.name) ? { hub: hubOf.get(r.name) } : {}),
    countries: [...new Set([...crossed(r), ...(tableCountries.get(r.name) ?? [])])],
    gauges: r.gauges.map((g) => [round(g[1]), round(g[0])] as [number, number]),
    lines: r.lines.map((line) => {
      const moved = out.extra.slice(at, (at += line.length));
      let along = 0;
      return {
        real: line.flatMap(pair),
        inflated: moved.flatMap(pair),
        dist: line.map((p, i) => Math.round((along += i ? km(line[i - 1], p) : 0))),
      };
    }),
  }));

  return {
    inflate: {
      countries: regions.map((g, i) => ({
        name: g.name,
        km: g.want,
        real: g.rings.map((r) => r.ll.map(pair)),
        inflated: out.rings[i].map((ring) => ring.map(pair)),
      })),
      points,
    },
    rivers: { rivers },
  };
}
