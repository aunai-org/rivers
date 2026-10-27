# River Globe: where the work stands

The idea: countries "inflated" by the length of their longest river. Three pieces came out of it, all kept in this folder.

| Piece | Where | State |
| --- | --- | --- |
| **App** (Three.js globe) | this folder, `src/`, `data/` | Builds, `npm test` passes 18/18. Now has **Inflate by river** and **River flow · live** (2026-10-27, branch `feat/inflate-river-flow`). Arcs and fan-out not yet checked by eye. |
| **Dashboard** (claude.ai artifact) | `dashboard/` is the saved copy; live at https://claude.ai/artifact/AztfbAsjjDVuPeBHL8UqCp | Published (files/index.html at store version 7). Its automatic check never returned a result, so it has never been confirmed to render without errors. |
| **Mockup** (liquid-glass design canvas) | `mockup/project/`; live at https://claude.ai/artifact/6GCSGRjNwHAyC8xrecfRHN | Published, 2 artboards (phone, desktop). Not viewed after publish. |

## The data

`data/rivers.csv` (also copied into `dashboard/`): 35 countries with land area (km²), longest river and its length (km). **The figures are approximate, written from memory by Claude, not looked up.** A shared river counts in full for every country it crosses (Nile, Amazon, Danube, Rhine, Mekong, Niger).

Inflation = (country's share of total river length) ÷ (its share of total land area). Above 1 the country grows when resized by its river. Luxembourg is the extreme at about 163×. Russia, Canada, the US, China and Australia shrink.

If the user supplies real data, replace the CSV and check `MOUTH` and `CENTRE` in `data/build.ts`, which hold hand-written map positions for every river and country.

## The app (this folder)

Built from `C:\Users\omr\Projects\earth-template` (remote `https://github.com/aunai-org/earth-template`, MIT). The user called it "globe-template"; that folder does not exist, this is the one they meant. `earth-template` itself was left untouched.

Mapping onto the template's three kinds: **hub = River** (pinned at its mouth), **item = Country** (fans out around its river, card shows area, river, inflation), **node = Country centre** (an arc runs from the river to it). Wording is in `src/config.ts`; data is built in `data/build.ts` from the CSV. Dates are turned off.

### Added 2026-10-27: Inflate by river, and River flow (live)

Spec `docs/superpowers/specs/2026-10-27-inflate-and-river-flow-design.md`, plan `docs/superpowers/plans/2026-10-27-inflate-and-river-flow.md`, how it works in `docs/ARCHITECTURE.md`.

**Inflate by river** (toggle in the Filters panel):
- It is the dashboard's cartogram, now on the 3D globe.
- It is computed at build time (`data/geo/cartogram.ts`, `data/geo/assets.ts` → `/inflate.json`).
- The browser repaints the Earth texture through the morph: 2.4 s with an elastic overshoot.
- Pins, the item fan, arcs and fly-to follow the inflated land.
- Table countries take five blue bands by river length, with a key under the toggle.

**River flow · live** (toggle):
- 335 Natural Earth 50m rivers, each oriented source → mouth (`data/geo/rivers.ts` → `/rivers.json`).
- They draw out from their sources, then comet pulses run downstream. Width and pace follow today's discharge from the Open-Meteo Flood API (GloFAS model, CC BY 4.0).
- Hovering a river shows its name, length and today's m³/s. A River card shows "Flow today".
- The rivers bend with the inflated land too.
- The CSP gains `connect-src https://flood-api.open-meteo.com`. That is the only outside request, and it happens only when the toggle is on.

Things learned the hard way:
- **Open-Meteo's free tier refuses more than ~600 locations a minute** (each location counts). The app samples about 470, then runs a second pass after 65 s.
- Natural Earth lines can sit one model cell off GloFAS's channel. The Amazon reads 0 on the line and 63,679 m³/s 0.05° west, so dry rivers are re-sampled at ±0.05° and ±0.1°. The Amazon may still read "no data" if it misses the cap; values under 1 m³/s count as no data.
- Natural Earth digitises some stems upstream, and renamed stems begin at a tributary's mouth. The direction rules in `rivers.ts` handle this, and 40 major rivers were checked by hand.
- Natural Earth names: "Amazonas" is shown as Amazon, "Huang" as Huang He, and "Amu  Darya" has a double space.
- In the Claude desktop Browser pane, a page gets **no requestAnimationFrame** while the window is out of view. In dev builds `window.__globe` and `window.__flow` let you step frames by hand to check visuals.

Known loose ends:
- Not yet checked by a person at full speed: the morph's feel at 60 fps, and hover on a real mouse. Every state was checked with frames stepped by hand.
- Not yet checked in the browser: arcs, and the fan-out of countries around a selected river.
- Smaller rivers (Natural Earth 10m, HydroRIVERS) and real gauges (USGS and others) are the next step for the flow layer.
- Git: a local repository was created on 2026-10-27, with work on branch `feat/inflate-river-flow`. There is no remote.
- `earth-template/node_modules` is broken (Vite was missing its `dist`). This folder has a clean install, so use this one.

## The dashboard (`dashboard/`)

A claude.ai Dashboard artifact. Its content lives in the artifact's own store, not on disk: documents `dash/meta`, `datasets/countries` (an attached copy of the CSV), `files/index.html` (the page), `files/world.js` (simplified country outlines from `world-atlas`, written as `window.WORLD`). `dashboard/index.json` is the page as the store document; `dashboard/page.html` is the same page as plain HTML. Edit `page.html`, rebuild the JSON with `JSON.stringify({text: html})`, and write it back with the ArtifactData tool, pinning `if_version`.

What the page does: a globe you drag to rotate, with +/−/Reset zoom, and a Real size / Inflated by river toggle. The inflated view is an **area cartogram**: every vertex is pushed (Dougenik rubber-sheet style, 14 iterations) until each country's area follows its river length, countries outside the table are squeezed to 35% of their size, and the result is converted back to longitude/latitude so it can sit on the globe. Countries are coloured in five bands of river length. Clicking a country (or a river card) outlines every country on that river and opens a detail card with a generated sketch of the river. A sortable table and a gallery of river sketches sit underneath.

Things learned the hard way:
- The dashboard's d3 build has **no map projections** (`d3.geoEqualEarth is not a function` stopped the page once). The page therefore has its own Equal Earth projection and its own orthographic projection.
- Every figure on the page must come from a dataset and be marked with `data-source`; computed values go through `dash.calc`. The two calcs are `inflation` and `top`.
- A publish once went out with a duplicate variable name (`cache`) and stopped the page. Always syntax-check the script before writing it to the store: `new Function('dash','d3', script)`.
- Testing page code with Node `eval` is about ten times slower than real; do not trust those timings (the real cartogram takes about 0.4 s).
- The river "photos" are **generated sketches**, not photographs: the page cannot load external images and no photos were available. If the user supplies images, they would be uploaded as artifact assets.
- Bash heredocs: always close them with their terminator line; two attempts swallowed the whole command.

## The mockup (`mockup/`)

A Design canvas in a liquid-glass / Aero style for a river app: animated water (drifting blobs, rolling waves, flowing river lines with ripples), glass panels with a moving sheen, length bars that grow and shimmer. Files: `project/canvas.json` (index), `Main.dc.html` (phone, 390×844), `Desktop.dc.html` (1280×800). Numbers on it come from the CSV; the inflation figures were corrected to 163×, 24×, 23×, 23×. It follows reduced-motion settings.

## What the user asked for, in order

1. Countries inflated by their biggest river (dashboard).
2. Rerun after 18 hours (a scheduled task was made, then deleted once the work was done now).
3. A map instead of bubbles, then stretched joined countries like puzzle pieces, then a globe with zoom controls and colour by river length.
4. On click, a list of rivers with images (done as sketches).
5. Clean up the text; no how-to wording on the page.
6. A liquid-glass river mockup.
7. Use their globe template: built as this app, plus the dashboard and mockup files moved here. Nothing of the user's was ever written into `C:\Users\omr\Projects\aunai`.

## Good next steps

1. Look at the two new views at full speed; merge `feat/inflate-river-flow` into `main` if happy.
2. Run the app and check arcs and the fan-out. (The "NEWEST" label is gone; the River card shows "Flow today" instead.)
3. Replace the approximate figures with sourced ones.
4. If real river photos are wanted, ask the user for image files.
5. Open the dashboard once in a browser and read its run record (`data/users/me`, document `runs`) to confirm there are no errors.
