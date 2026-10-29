# River Globe: where the work stands

The idea: countries "inflated" by the length of their longest river. Three pieces came out of it, all kept in this folder.

| Piece | Where | State |
| --- | --- | --- |
| **App** (Three.js globe) | this folder, `src/`, `data/` | Builds, `npm test` passes 41/41. Has **Inflate by river** and **River flow · live** (2026-10-27), and since 2026-10-28 no pin markers: country names on the globe, click a country or a river to filter the rivers. Merged into `main` 2026-10-28 and pushed to https://github.com/aunai-org/rivers (the app is now named "Rivers"). |
| **Dashboard** (claude.ai artifact) | `dashboard/` is the saved copy (local only, git-ignored); live at https://claude.ai/artifact/AztfbAsjjDVuPeBHL8UqCp | Published (files/index.html at store version 7). Its automatic check never returned a result, so it has never been confirmed to render without errors. |
| **Mockup** (liquid-glass design canvas) | `mockup/project/` (local only, git-ignored); live at https://claude.ai/artifact/6GCSGRjNwHAyC8xrecfRHN | Published, 2 artboards (phone, desktop). Not viewed after publish. |

## The data

`data/rivers.csv` (also copied into `dashboard/`): 35 countries with land area (km²), longest river and its length (km). **The figures are approximate, written from memory by Claude, not looked up.** A shared river counts in full for every country it crosses (Nile, Amazon, Danube, Rhine, Mekong, Niger).

Inflation = (country's share of total river length) ÷ (its share of total land area). Above 1 the country grows when resized by its river. Luxembourg is the extreme at about 163×. Russia, Canada, the US, China and Australia shrink.

If the user supplies real data, replace the CSV and check `MOUTH` and `CENTRE` in `data/build.ts`, which hold hand-written map positions for every river and country.

## The app (this folder)

Built from `C:\Users\omr\Projects\earth-template` (remote `https://github.com/aunai-org/earth-template`, MIT). The user called it "globe-template"; that folder does not exist, this is the one they meant. `earth-template` itself was left untouched.

Mapping onto the template's three kinds: **hub = River**, **item = Country** (its row: area, river, inflation), **node = Country centre** (where its name label sits). Wording is in `src/config.ts`; data is built in `data/build.ts` from the CSV. The template's dates, Latest list, category toggles, pin markers and arcs are no longer used (the marker code is still in `src/globe.ts`, idle).

### Changed 2026-10-28: labels instead of markers, selection filters rivers, two side cards

The user asked for: no markers; small country names at the centres; selecting a river shows only that river, selecting a country shows only its rivers; a legend card for flow data; a card saying what inflated mode means, with colour by river length.
- **Labels** (`src/labels.ts`): HTML names over the globe, hidden on the far side and where they would overlap (bigger country wins). They slide with the inflated land, and while inflated they add the country's longest river. Click one to select the country.
- **Selection** (`src/select.ts`): a country shows the rivers that cross it; a river shows alone, and the camera frames it. Rivers are picked by clicking their line, from the River flow card, or with the search box (countries and rivers, via a datalist). Selecting loads the river lines (local file) even with River flow off; only the live switch fetches discharge.
- **Which rivers cross which country** is worked out at build time: point-in-polygon on the 110m outlines (two vertices count as a crossing), plus the table's own river for each country. Coarse borders give oddities (the Ganges lists China).
- **Canals** are dropped (Natural Earth files Suez and Ismailiya as rivers): 331 rivers now.
- **River flow card** (right side, while rivers show): width scale for 1,000 / 10,000 / 100,000 m³/s, the model and date, the rivers in view by today's flow (click to select), how many have a value, and the Open-Meteo CC BY credit.
- **Inflated by river card** (right side, while inflated): what the view means, and the five-band colour key. The bands are now five distinct blues from dark navy to bright.
- On phones both cards sit folded at the bottom right, beside Filters.

Later the same day the user said the flow pulses were "very fast for every river" and asked for a light-mode globe:
- **Pulse speed** (`flowSpeed` in `src/flowmath.ts`): was 160 + 110·log10(q) km/s, so 270–650 everywhere. Now a power law, 40·(q/100)^0.35 clamped to 15–260 km/s, 50 without data: a stream ≈18, 1,000 m³/s ≈90, the giants 260. Checked live: 15 / 87 / 260 km/s (min / median / max).
- **Namesake rivers split**: the user spotted that the Argentine Colorado was drawn as part of the US one. Natural Earth pieces were grouped by name only. Now pieces of one name more than 15° apart are separate rivers, named by the country most of each lies in: Colorado (United States / Argentina), Negro (Brazil / Argentina), San Juan (Nicaragua / Argentina), and, from a hand list because they are only 12° apart, Grande (Brazil / Bolivia). The Irtysh and Salween have 10–12° gaps in Natural Earth but stay one river each. 335 rivers now. The discharge cache key now includes a hash of the river names, so renamed rivers are fetched fresh.
- **Light globe** (sun/moon button in the top bar): a muted slate sky (#b4c1cf; the first, near-white sky was "so bright"), pale sea and paper-coloured land, dark-blue rivers blended as ink instead of added as light, with pastel-red pulses (navy pulses were invisible), no stars, a soft blue rim, brighter flat lighting, and light page colours (`:root[data-theme="light"]` in `src/style.css`). Inflated bands use a five-colour scale (light: yellow, green, teal, blue, purple; dark: purple, blue, teal, green, gold). Both palettes live in `SCENE` in `src/theme.ts`. The first visit follows the system setting; a choice is remembered under `river-globe:theme`.

### Changed 2026-10-28 (evening): sound, zoom, Cloudflare

- **Inflate sound** (`cueInflate` in `src/sound.ts`): a rising swell with a sweeping whoosh over the 2.4 s morph; deflating plays it falling over 0.9 s. Only with sound on. Not listened to by Claude (no audio in the test browser); checked only that it throws no errors.
- **Closer zoom**: `minDistance` 3.1 → 2.5, about one globe radius above the surface.
- **Cloudflare**: `wrangler.jsonc` serves `dist/` as Workers static assets; `npm run deploy` builds and deploys. Checked with `wrangler dev`: the CSP from `public/_headers` is applied, live flow loads from Open-Meteo, no console errors. `wrangler deploy --dry-run` passes. Not deployed yet: it needs `npx wrangler login` on the user's Cloudflare account.

### Changed 2026-10-29: flow proxy and edge cache

The user asked for the shared proxy. River flow no longer calls Open-Meteo from the browser:
- **`worker/index.ts`** runs first for `/api/*` only (`run_worker_first` in `wrangler.jsonc`); static files are served by Cloudflare directly. It checks the request, answers from the edge cache (`x-cache: HIT`), or asks Open-Meteo once and stores the answer 6 hours (`MISS`). Errors (429, 5xx) are passed on, never cached.
- **`worker/flood.ts`** is the tested part: only GET, `daily=river_discharge`, `forecast_days=1`, at most 100 matching latitude/longitude pairs in range; coordinates rounded to 3 decimals so visitors share cache keys; every other parameter is dropped.
- **CSP** is now `connect-src 'self'`: the browser never contacts another site. `src/discharge.ts` calls `/api/flood`; `npm run dev` gets the same route from a stand-in in `vite.config.ts` (no cache).
- Checked with `wrangler dev`: first call `x-cache: MISS`, second `HIT`; bad parameter and POST refused (400, 405); the page loaded live flow through the proxy with zero outside requests and no console errors. Not yet deployed.
- No key is used today. If Open-Meteo's commercial plan is ever needed, add the key to the Worker as a secret (`wrangler secret put`), never to the page.

### Added 2026-10-27: Inflate by river, and River flow (live)

Spec `docs/superpowers/specs/2026-10-27-inflate-and-river-flow-design.md`, plan `docs/superpowers/plans/2026-10-27-inflate-and-river-flow.md`, how it works in `docs/ARCHITECTURE.md`.

**Inflate by river** (toggle in the Filters panel):
- It is the dashboard's cartogram, now on the 3D globe.
- It is computed at build time (`data/geo/cartogram.ts`, `data/geo/assets.ts` → `/inflate.json`).
- The browser repaints the Earth texture through the morph: 2.4 s with an elastic overshoot.
- Country labels and fly-to follow the inflated land.
- Table countries take five blue bands by river length; the key is in the Inflated by river card.

**River flow · live** (toggle):
- 335 Natural Earth 50m rivers (canals dropped, namesakes split), each oriented source → mouth (`data/geo/rivers.ts` → `/rivers.json`).
- They draw out from their sources, then comet pulses run downstream. Width and pace follow today's discharge from the Open-Meteo Flood API (GloFAS model, CC BY 4.0).
- Hovering a river shows its name, length and today's m³/s. A River card shows "Flow today".
- The rivers bend with the inflated land too.
- The CSP gains `connect-src https://flood-api.open-meteo.com`. That is the only outside request, and it happens only when the toggle is on.

Things learned the hard way:
- **Open-Meteo's free tier refuses more than ~600 locations a minute** (each location counts). The app samples about 470, then runs a second pass after 65 s.
- Natural Earth lines can sit one model cell off GloFAS's channel. The Amazon reads 0 on the line and 63,679 m³/s 0.05° west, so dry rivers are re-sampled at ±0.05° and ±0.1°. The Amazon may still read "no data" if it misses the cap; values under 1 m³/s count as no data.
- Natural Earth digitises some stems upstream, and renamed stems begin at a tributary's mouth. The direction rules in `rivers.ts` handle this, and 40 major rivers were checked by hand.
- Natural Earth names: "Amazonas" is shown as Amazon, "Huang" as Huang He, and "Amu  Darya" has a double space.
- In the Claude desktop Browser pane, a page gets **no requestAnimationFrame** while the window is out of view. In dev builds `window.__globe`, `window.__flow` and `window.__labels` let you step frames by hand to check visuals.

Known loose ends:
- Not yet checked by a person at full speed: the morph's feel at 60 fps, and hover on a real mouse. Every state was checked with frames stepped by hand.
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
2. Try the labels and selection with a real mouse: label clicks, river clicks, a drag that starts on a label (it does not rotate the globe), and the wheel over a label (it does not zoom).
3. Replace the approximate figures with sourced ones.
4. If real river photos are wanted, ask the user for image files.
5. Open the dashboard once in a browser and read its run record (`data/users/me`, document `runs`) to confirm there are no errors.
