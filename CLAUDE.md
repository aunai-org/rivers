# River Globe

Read `SUMMARY.md` first. It says what exists, what state it is in, and what is left. Do not start over.

## Layout

- `src/`, `data/`, `index.html`: the Three.js app, built from aunai-org's `earth-template`. River = hub, country = item, country centre = node.
- `data/rivers.csv`: the source figures. They are approximate, written from memory.
- `data/build.ts`: turns the CSV into the app's dataset. Hand-written map positions live in `MOUTH` and `CENTRE`.
- `src/config.ts`: names and wording. `docs/`: the template's own notes on customising it.
- `dashboard/`: saved copy of the claude.ai dashboard (page, data, world outlines). The live version is in the artifact store.
- `mockup/`: saved copy of the liquid-glass design canvas.

## Run

```bash
npm install
npm run dev     # PORT=5180 to pick a port
npm test        # node --test over data/**/*.test.ts and src/**/*.test.ts
npm run build   # tsc --noEmit, then vite build
```

Use this folder's `node_modules`. The one in `earth-template` is broken.

## Rules for working here

- Keep the figures labelled approximate until real sources replace them.
- The dashboard's page code runs in a locked-down runtime: no modules, no network, d3 without map projections. Check any script with `new Function('dash','d3', code)` before writing it to the store, and pin `if_version` on every write.
- The river images on the dashboard are generated sketches, not photos. Say so wherever they appear.
- Do not edit `earth-template` or `C:\Users\omr\Projects\aunai`. This folder is the home for all of it.
- Do not claim something renders unless it was opened in a browser. Say what was and was not checked.
- Close every bash heredoc with its terminator line.
- River discharge is a GloFAS model value; label it as a model, never as a gauge reading. Keep Open-Meteo's CC BY credit in the About panel and notices.
- Mind Open-Meteo's ~600 locations/minute limit when testing; the browser keeps a 6-hour cache under `river-globe:flow`.

## Open items

See "Good next steps" in `SUMMARY.md`: review the inflate and river-flow views at full speed and merge their branch, check arcs and fan-out, smaller rivers and real gauges, real data, real photos.
