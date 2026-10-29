# Architecture

A static Vite + TypeScript page with three.js for the globe. No framework. The browser loads only files from its own origin, except for the opt-in live river discharge (see River flow).

```
build:   data/build.ts ──► dist/data.json                  (vite.config.ts writes it; dev serves it live)
browser: /data.json ──► useData() ──► render() ──► labels.set(), riverFlow.setShown()
                          │                └─► card, River flow card, status
                          └─ saved copy in localStorage: painted first, replaced when fresh data arrives
```

## What is on the map

There are no pin markers. Country names (`src/labels.ts`) sit at each country centre as HTML laid over the canvas: projected every frame, hidden on the far side, and culled where they overlap (the bigger country wins, the selected one always shows). `render()` in `src/app.ts` decides the rest from the selection (`riversShown()` in `src/select.ts`):

| Selected | Rivers drawn | Card |
| --- | --- | --- |
| Nothing | Every river while River flow is on, none otherwise | none |
| A country (label or search) | The rivers that cross it | Its table row, river count, the river with most water |
| A river (its line, a list, or search) | Only that river; the camera frames it | Length, countries crossed source → mouth, flow today |

A river wins over a country, and closing its card goes back to the country. Selecting loads `/rivers.json` (local) even with River flow off; discharge is fetched only by the River flow switch.

The **River flow card** shows while rivers are drawn: width scale, model and date, the rivers in view by today's flow, and the credit. The **Inflated by river card** shows while the land is inflated: what it means, and the colour key.

## The globe (`src/globe.ts`)

The marker machinery below comes from the template and is idle here (the app passes no pins). The hooks this app uses are `onFrame` (river layer), `onDraw` (labels, after the camera moves), `probe` (river hover) and `onLayerPick` (river click).

- **Fixed pixel sizes.** Markers keep the same size on screen at every zoom. Pins on the far side of the Earth are hidden and can't be clicked.
- **Clustering** happens in screen space every frame. Pins that land within a few pixels merge into a numbered badge. One click on a badge zooms in and fans its pins out. Zooming out re-stacks them.
- **The selection's ring.** Pins near a selected hub or node are placed on a ring just outside its item ring, so nothing hides underneath it.
- **Arcs** are rebuilt every frame between wherever their two ends are drawn, and animate from the first end. Only new arcs animate, so a redraw doesn't replay them.
- **Materials are reused.** Markers share one material per icon style, pulse rings come from a pool, and badges persist. Disposing and recreating them on every click made three.js delete and recompile shader programs each time (about 36 compiles in 20 clicks in Modex), so don't.
- **Layout for small screens.** `setLayout()` shifts the view so the globe is centred in the space the card leaves free, and shrinks markers on narrow windows.

## The sky (`src/space.ts`)

Everything is procedural, with no image files: a blurred Milky Way texture plus a separate crisp layer of band stars, two star layers, two shooting-star line segments that spawn in view, a few low-poly rocks, satellites on a ring that always faces the camera (so they circle the globe instead of crossing it), and a rim glow shader that fades to nothing at its outer edge.

## Light and dark (`src/theme.ts`)

`SCENE.dark` and `SCENE.light` hold the scene colours: sky, sea, land, borders, the five inflate bands, river and pulse-head colours, and the rim glow. `globe.setMode()` sets the background, hides the whole sky group in light mode, swaps the rim glow from additive to normal blending, and raises the ambient light (three.js divides light by π, so a white ambient near 2.5 shows a pale map at about its own colours). `EarthPainter.setMode()` repaints the surface at the current morph. `RiverFlow.setMode()` swaps colours and switches the ribbons from additive light (night) to alpha-blended ink (day). The page follows through `:root[data-theme="light"]` in `src/style.css`.

## Inflate by river (`data/geo/`, `src/inflate.ts`)

- **Build time.** `data/geo/assets.ts` runs the cartogram (`data/geo/cartogram.ts`, which is the dashboard's Equal Earth + Dougenik algorithm, 14 iterations) over world-atlas 110m countries. It weights countries by `data/rivers.csv` and squeezes the rest to 35%. Country centres and every river vertex are moved by the same displacement field. The output is `/inflate.json`, with real and inflated rings that have the same vertex count, plus the inflated centre positions.
- **Browser.** `EarthPainter` repaints the 2048×1024 Earth texture at each morph value t, drawing `lerp(real, inflated, t)` in equirectangular. Rings are unwrapped so Russia and Fiji don't streak across the map. Labels keep their real and inflated positions and slide between them, so they and fly-to follow the land.
- **Animation.** Inflating takes 2.4 s with an elastic overshoot. Deflating takes 0.9 s with cubic easing. Reduced motion jumps straight to the end.

## River flow (`data/geo/rivers.ts`, `src/flow.ts`, `src/discharge.ts`)

- **Lines.** These are Natural Earth 50m river and lake centre lines (`data/ne_50m_rivers_lake_centerlines.geojson`), canals dropped. Pieces with the same name are joined, except where they lie more than 15° apart (or are listed in `NAMESAKES`): those are different rivers, and `assets.ts` adds the country most of each lies in to its name, e.g. Colorado (Argentina). and the longest path becomes the main stem. Each river lists the countries it crosses (point-in-polygon on the 110m outlines, plus the table's own river for each country).
- **Direction rules, in order:**
  1. A known mouth (`MOUTH`).
  2. One end at the sea while the other is well inland.
  3. An end touching the middle of another river.
  4. The length-weighted digitising direction.
  5. The nearer coast.
- **Drawing.** One merged ribbon mesh draws the rivers; a per-vertex `lit` attribute hides rivers outside the selection, and a new selection replays the reveal. The vertex shader mixes the real and inflated positions and widens the ribbon sideways. The fragment shader reveals rivers from the source at 2,600 km/s and runs comet-shaped pulses toward the mouth, at 15–260 km/s by discharge (`flowSpeed`). Hover uses a screen-space probe over the river vertices.
- **Discharge.** The browser calls the site's own `/api/flood`; `worker/index.ts` validates it (`worker/flood.ts`), serves it from the edge cache or asks Open-Meteo once, and keeps the answer 6 hours. Values come from the Open-Meteo Flood API (GloFAS v4, daily, about 5 km grid, CC BY 4.0).
  - The free tier allows about 600 locations a minute. Rank ≤ 4 rivers are sampled at 2 points near the mouth, the rest at 1, which comes to about 470.
  - After 65 s a second pass retries refused batches. It also re-samples rivers that came back dry, at ±0.05° and ±0.1°, because Natural Earth lines can sit a model cell off the GloFAS channel.
  - Values under 1 m³/s count as no data.
  - A complete answer is cached for 6 hours.

## Responsive rules (`src/app.ts`)

| Window | Behaviour |
| --- | --- |
| Under 1000px wide | Compact: side panels start folded and fold again when a card opens, rings are capped, and the globe centres beside the card |
| Under 600px wide | The card is a bottom sheet |
| Under 640px tall | Side panels fold when a card opens |

## Performance

- The draw loop does nothing while the tab is hidden.
- Shooting stars, asteroids and satellite motion stop when the system asks for reduced motion.
- The renderer runs at a pixel ratio of 1.

## Security

- The page's Content Security Policy (`public/_headers`) allows only its own origin, plus `connect-src https://flood-api.open-meteo.com` for the River flow view. That request is made only when the view is turned on. There are no inline scripts or styles.
- Data is rendered as text, and card links must start with `https://`.
- `config.about.rows[].html` is the one place HTML is inserted. It is authored by you, not loaded from data.
