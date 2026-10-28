# River Globe

An interactive Earth of the world's longest rivers and the countries they cross, built from the aunai-org `earth-template`.

- Country names sit at each country's centre. Click one to see only the rivers that cross it, or click a river line to see it alone. The search box finds both.
- Land areas and river lengths are in `data/rivers.csv`. The figures are approximate, written from memory, and a shared river counts in full for each country.
- "Inflation" is a country's share of total river length divided by its share of total land area.

Two views sit at the top of the Filters panel:

- **Inflate by river**: the land morphs into an area cartogram, where each country's area follows its longest river. Labels and rivers move with it, and a card explains the view and its colour key.
- **River flow · live**: 331 Natural Earth rivers draw out from source to mouth, and pulses run downstream. Width and pace follow today's modelled discharge from the Open-Meteo Flood API (GloFAS). A legend card shows the width scale and the rivers in view by today's flow. This is the only time the page contacts another site.

## Run it

```bash
npm install
npm run dev     # first request for /inflate.json builds the cartogram (a few seconds)
npm test        # node --test: cartogram, river chaining and direction, assets, ribbon maths
npm run build
```

## Also in this folder

- `dashboard/` — the "Rivers Inflate Countries" dashboard page, its data, and the bundled world outlines.
- `mockup/` — the River Glass liquid-glass mockup (phone and desktop screens).

The template's own notes are in `docs/`. Licensed MIT (see `LICENSE`).
