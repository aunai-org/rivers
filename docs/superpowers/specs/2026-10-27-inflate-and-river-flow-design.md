# Inflate view and live river flow on the Three.js globe

Date: 2026-10-27. The user approved the direction ("toggle on the existing globe") and delegated every other decision. Those decisions are marked **Decided**.

## Goal

1. **Inflate by river.** A toggle on the existing globe morphs every country from its real shape to an area cartogram, where each country's area follows the length of its longest river. This is the dashboard's view, now on the 3D globe. Pins, arcs and cards keep working and ride along with the stretched land.
2. **River flow (advanced, on a switch).** The world's major rivers are drawn on the globe, each running from source to mouth. Animated flow moves downstream. The width and speed of the flow follow today's modelled discharge, fetched live.

## Decisions

- **Morph rendering: repaint the Earth texture (approach A).** Real and inflated rings are both in longitude/latitude. For a morph value `t` the canvas draws `lerp(real, inflated, t)` in equirectangular, then uploads it. It runs at 1024×512 while animating and 2048×1024 when it settles. A per-country mesh (approach B) was rejected because it needs a triangulator and antimeridian handling, for no visible gain at this zoom range.
- **The cartogram runs at build time, in Node.** `data/geo/cartogram.ts` ports the dashboard's algorithm: Equal Earth projection, Dougenik rubber-sheet, 14 iterations, non-table countries squeezed to 35%. Its result is fitted back to the original frame and converted to longitude/latitude. The browser downloads the result (`/inflate.json`) and does no heavy maths.
- **Extra points ride the same displacement field.** River mouths, country centres and every river vertex are moved by the cartogram as weightless points. This keeps pins and rivers on the right country in the inflated view.
- **Colour.** In the inflated view, table countries blend from their land grey to one of five blue bands by river length, as in the dashboard: <1,000, 1,000–2,000, 2,000–3,500, 3,500–5,000 and 5,000+ km. Other countries stay grey.
- **Animation.** The inflate morph takes 2.4 s with an elastic ease-out. Deflating takes 0.9 s with cubic in-out. Reduced-motion settings jump straight to the end.
- **River geometry: Natural Earth 50m `rivers_lake_centerlines`** (public domain), committed as `data/ne_50m_rivers_lake_centerlines.geojson`. Segments are grouped by name, joined into a graph, and reduced to the longest path (the main stem). Tributary segments of the same name are kept as branches, each oriented downstream.
- **Flow direction.**
  - Rivers in the table use the known mouth in `MOUTH`.
  - For other rivers, an end that touches a different river is a confluence, which makes it the mouth.
  - Failing that, the end nearer the coastline (`world-atlas` land-50m) is the mouth.
- **Live discharge: Open-Meteo Flood API** (`flood-api.open-meteo.com/v1/flood`, GloFAS v4 model, CC BY 4.0, no key).
  - Requests are batched over several locations.
  - Each river is sampled at points 3%, 6% and 10% of its length up from the mouth, and the maximum is used.
  - The result is cached in localStorage for 6 hours. Nothing is fetched until the switch is turned on.
  - The CSP gains `connect-src https://flood-api.open-meteo.com`. This is the only third-party origin, and it is opt-in.
- **Flow rendering.** One merged ribbon mesh lies on the sphere. Each vertex carries its distance from the source (km), its river index, and real and inflated positions. A shader animates bright pulses moving downstream, which speed up and widen with discharge. Turning the switch on draws every river from its source in about 2.5 s, then the flow continues.
- **Hover.** Hovering a river shows its name, length and today's discharge with the date. With no live data it shows "no live data".
- **UI.** A new "View" group at the top of the Filters panel holds two toggles: "Inflate by river" and "River flow · live". A selected River card gains a "Flow today" row when live data has loaded.
- **Labels.** Discharge is labelled as a model (GloFAS), not a gauge reading. The CSV figures stay labelled approximate.

## Out of scope (later)

Small rivers (Natural Earth 10m and HydroRIVERS), real gauges (USGS and others), and a time slider through the discharge history.

## Testing

- `node --test` covers the pure build modules: the projection round trip, the cartogram areas moving toward their targets, river chaining and orientation, and the gauge sampling.
- `npm run build` must pass `tsc`.
- Final check in the browser pane: toggle, morph, pins following the land, rivers flowing, live data loaded, and the console clean.
