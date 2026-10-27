# River Globe: where the work stands

The idea: countries "inflated" by the length of their longest river. Three pieces came out of it, all kept in this folder.

| Piece | Where | State |
| --- | --- | --- |
| **App** (Three.js globe) | this folder, `src/`, `data/` | Builds. Runs at `npm run dev`. Arcs and fan-out not yet checked by eye. |
| **Dashboard** (claude.ai artifact) | `dashboard/` is the saved copy; live at https://claude.ai/artifact/AztfbAsjjDVuPeBHL8UqCp | Published (files/index.html at store version 7). Its automatic check never returned a result, so it has never been confirmed to render without errors. |
| **Mockup** (liquid-glass design canvas) | `mockup/project/`; live at https://claude.ai/artifact/6GCSGRjNwHAyC8xrecfRHN | Published, 2 artboards (phone, desktop). Not viewed after publish. |

## The data

`data/rivers.csv` (also copied into `dashboard/`): 35 countries with land area (km²), longest river and its length (km). **The figures are approximate, written from memory by Claude, not looked up.** A shared river counts in full for every country it crosses (Nile, Amazon, Danube, Rhine, Mekong, Niger).

Inflation = (country's share of total river length) ÷ (its share of total land area). Above 1 the country grows when resized by its river. Luxembourg is the extreme at about 163×. Russia, Canada, the US, China and Australia shrink.

If the user supplies real data, replace the CSV and check `MOUTH` and `CENTRE` in `data/build.ts`, which hold hand-written map positions for every river and country.

## The app (this folder)

Built from `C:\Users\omr\Projects\earth-template` (remote `https://github.com/aunai-org/earth-template`, MIT). The user called it "globe-template"; that folder does not exist, this is the one they meant. `earth-template` itself was left untouched.

Mapping onto the template's three kinds: **hub = River** (pinned at its mouth), **item = Country** (fans out around its river, card shows area, river, inflation), **node = Country centre** (an arc runs from the river to it). Wording is in `src/config.ts`; data is built in `data/build.ts` from the CSV. Dates are turned off.

Known loose ends:
- The card still shows a "NEWEST" row label (from the template's date feature) that makes no sense for rivers. It comes from `src/app.ts`.
- Not yet checked in the browser: arcs, and the fan-out of countries around a selected river. The last test pane was very short.
- The app does **not** have the dashboard's stretched-countries view. The template only draws pins and arcs. Porting the cartogram (see below) onto the Three.js globe would be new work.
- No git repository here yet; the template's `.git` was deliberately not copied.
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

1. Run the app and check arcs and the fan-out; fix the "NEWEST" label.
2. Decide whether the stretched-countries view should come to the app.
3. Replace the approximate figures with sourced ones.
4. If real river photos are wanted, ask the user for image files.
5. Open the dashboard once in a browser and read its run record (`data/users/me`, document `runs`) to confirm there are no errors.
