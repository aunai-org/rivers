# Inflate View and River Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Inflate by river" morph and a live "River flow" layer to the Three.js globe.

**Architecture:** The heavy geometry runs at build time in `data/geo/*`. The Vite plugin emits it as `/inflate.json` and `/rivers.json`. The browser repaints the Earth texture for the morph and draws rivers as one shader-animated ribbon mesh. Discharge comes live from Open-Meteo.

**Tech Stack:** TypeScript, Vite 7, three 0.186, d3-geo, topojson-client, world-atlas, and `node --test` (Node 24, which strips types natively).

**Spec:** `docs/superpowers/specs/2026-10-27-inflate-and-river-flow-design.md`

## Global Constraints

- No new runtime dependencies. Tests use `node --test`.
- New `data/geo/*.ts` files import with explicit `.ts` extensions, so Node can run them. `tsconfig` gets `allowImportingTsExtensions: true`.
- Only one third-party origin is added: `https://flood-api.open-meteo.com`, in `connect-src`.
- Discharge is labelled "model (GloFAS via Open-Meteo)". CSV figures stay labelled "approximate".
- Reduced motion: no morph animation and no flowing pulses (rivers are drawn static).

## Review Focus

- Rings that cross the antimeridian (Russia, Fiji) and Antarctica must paint without streaks across the map. This is checked in the browser.
- The live fetch can fail or be blocked (offline, CSP). The layer must still draw, and the tooltip must say "no live data".
- Toggling repeatedly in the middle of an animation must morph from the current `t`, not snap.
- A selection made while inflated must fly the camera to the inflated position.
- Rivers named twice (lake centerline plus river) must not double the main stem's length.

---

### Task 1: Equal Earth projection and cartogram (`data/geo/cartogram.ts`)

**Files:** Create `data/geo/cartogram.ts`, `data/geo/cartogram.test.ts`. Modify `tsconfig.json` and `package.json` (add `"test": "node --test data/geo/"`).

**Interfaces:**
- Produces: `eq(lon,lat): [x,y]` and `invEq(x,y): [lon,lat]`.
- Produces: `type Region = { name: string; want: number | null; rings: { hole: boolean; ll: [number,number][] }[] }`. A `null` value for `want` means the region is squeezed to 35%.
- Produces: `inflate(regions: Region[], extra: [number,number][], iters = 14): { rings: [number,number][][][]; extra: [number,number][] }`. The result holds each region's rings and the extra points, all in inflated lon/lat.

- [ ] Test `round trip`: `invEq(...eq(lon,lat))` stays within 1e-6 of the input for (0,0), (120,45) and (-170,-60).
- [ ] Test `areas move toward targets`: take two equal squares, one wanting 4× the other. After `inflate` the projected area ratio is > 2.
- [ ] Test `extra points move with their region`: a point at the centre of the growing square stays inside its inflated ring.
- [ ] Implement by porting `stats`, `cartogram` and `prepare` from `dashboard/page.html` (lines that start `function eq`). `prepare` becomes `inflate`, and the extra points are moved in the same vertex loop.
- [ ] Run `npm test`. Expect PASS. Commit.

### Task 2: River main stems, direction and gauges (`data/geo/rivers.ts`)

**Files:** Create `data/geo/rivers.ts`, `data/geo/rivers.test.ts`, and `data/ne_50m_rivers_lake_centerlines.geojson` (downloaded from the nvkelso/natural-earth-vector master).

**Interfaces:**
- Produces: `type RiverLine = { name: string; rank: number; lines: [number,number][][]; km: number; gauges: [number,number][] }`. Each line runs source→mouth, and `lines[0]` is the main stem.
- Produces: `buildRivers(fc: FeatureCollection, coast: [number,number][], mouths: Record<string,[lat,lng]>): RiverLine[]`.

- [ ] Test `chains fragments into one stem`: segments A→B and C→B (digitised reversed) form one line A…C or C…A.
- [ ] Test `orients to known mouth`: with mouth near B, the stem ends at B.
- [ ] Test `orients to coast when no mouth`: the stem ends at the end nearer a coast point.
- [ ] Test `confluence beats coast`: when one end touches another river's line, that end is the mouth.
- [ ] Test `gauges sit near the mouth`: there are three gauges, all within the last 12% of the stem's length.
- [ ] Implement:
  - Snap endpoints to a 0.02° grid and build an adjacency graph.
  - Take the main stem as the longest path (two weighted searches over each connected component; keep the largest component).
  - Keep other components ≥ 150 km as branches, oriented by the same rules.
  - Simplify with Douglas–Peucker at 0.02°.
- [ ] Run `npm test`. Expect PASS. Commit.

### Task 3: Build output `/inflate.json` and `/rivers.json`

**Files:** Create `data/geo/assets.ts`. Modify `vite.config.ts` and `src/data.ts` (add types and URLs).

**Interfaces:**
- Produces: `InflateAsset = { countries: { name: string; km: number | null; real: [number,number][][]; inflated: [number,number][][] }[]; points: Record<string,[lat,lng]> }`. `points` holds inflated positions keyed by `hub:<id>` or `node:<id>`.
- Produces: `RiversAsset = { rivers: { name: string; km: number; hub?: string; gauges: [lat,lng][]; lines: { real: number[]; inflated: number[]; dist: number[] }[] }[] }`. `real` and `inflated` are flat [lng,lat,…] arrays, and `dist` is km from the source.
- Produces: `buildAssets(dataset: Dataset): Promise<{ inflate: InflateAsset; rivers: RiversAsset }>`, memoised.
- Produces in `src/data.ts`: `INFLATE_URL = "/inflate.json"` and `RIVERS_URL = "/rivers.json"`.

- [ ] Test (`assets.test.ts`): the Nile exists, its first point is south of its last, and it carries `hub: "nile"`. The Egypt inflated area is larger than its real area on the planar Equal Earth projection.
- [ ] Implement:
  - Countries come from world-atlas `countries-110m`, matched to CSV rows (aliases `United States`→`United States of America`, `DR Congo`→`Dem. Rep. Congo`).
  - The extra points are the hubs, the nodes and every river vertex.
  - In `vite.config.ts`, serve both files in dev and emit both at build time.
- [ ] Run `npm test` and `npm run build`. Expect PASS. Commit.

### Task 4: Morphable Earth texture and pins (`src/inflate.ts` and `src/globe.ts`)

**Interfaces:**
- Produces: `class EarthPainter { constructor(renderer); texture: CanvasTexture; setShapes(asset: InflateAsset); paint(t: number, hi: boolean) }`.
- Produces in Globe: `setInflation(target: 0|1)` animates `t`, and `inflation(): number`. Pins get optional `alt?: { lat; lng }`, and `home` is slerped between the real and alt positions every frame while `t` changes. `focus` uses the alt position when `t > 0.5`.

- [ ] Implement `EarthPainter`.
  - Planar equirectangular drawing of the interpolated rings.
  - Before the shapes load, fall back to the existing `earthTexture` look.
  - Colour bands use `BINS=[1000,2000,3500,5000]` and blue `#3b82f6` mixed at 22/40/60/80/100% over land grey.
- [ ] In `app.ts`:
  - Pass `alt` from `points`.
  - Add the "View" group buttons to `index.html` and the copy to `config.ts`.
- [ ] Verify in the browser:
  - The toggle morphs.
  - Pins follow the land.
  - The Antarctica and Russia edges are clean.
- [ ] Commit.

### Task 5: River flow layer (`src/flow.ts`)

**Interfaces:**
- Produces: `class RiverFlow { constructor(scene, radius); setData(asset: RiversAsset); setVisible(on: boolean); setDischarge(map: Map<string,{q:number; date:string}>); update(now: number, t: number); hit(ray): { name; km; q? } | null }`.
- Produces: `fetchDischarge(rivers: RiversAsset["rivers"]): Promise<Map<string,{q:number;date:string}>>`. It uses chunks of 50 locations and a localStorage cache keyed `river-globe:flow` with a 6-hour TTL.

- [ ] Test (`src/flowmath.test.ts`, pure): `ribbon(points, dists, width)` returns 2 vertices per point, and the strip indices count is `(n-1)*6`.
- [ ] Implement:
  - One merged `BufferGeometry` with attributes `p0`, `p1`, `side`, `dist`, `speed` and `width`.
  - A `ShaderMaterial` with additive blending: the vertex shader mixes `p0`/`p1` by `uT` and offsets along the side vector. The fragment shader draws pulses `smoothstep` on `fract((dist - uTime*speed)/spacing)`, plus a reveal on `dist/len < uReveal`.
  - Glow colour `#9ecbff`, with the pulse head toward white.
- [ ] Wire everything up:
  - The toggle fetches discharge.
  - The tooltip reads from `globe.hoverTip` (river hit after markers).
  - The River card gets a "Flow today" row.
  - Add CSP `connect-src`. Add the about row and the notice for Open-Meteo / GloFAS (CC BY 4.0).
- [ ] Verify in the browser: the rivers draw from source to mouth, the pulses move downstream, the discharge loads and the tooltip works. Commit.

### Task 6: Docs

- [ ] Update `SUMMARY.md`, `CLAUDE.md` (open items), `docs/ARCHITECTURE.md` and `README.md`. Commit.
