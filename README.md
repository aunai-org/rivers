# River Globe

An interactive Earth of the world's longest rivers and the countries they cross, built from the aunai-org `earth-template`.

- **River** (pinned at its mouth) → **Country** (fans out around the river) → **Country pin** (an arc reaches its centre).
- Land areas and river lengths are in `data/rivers.csv`. The figures are approximate, written from memory, and a shared river counts in full for each country.
- "Inflation" is a country's share of total river length divided by its share of total land area.

## Run it

```bash
npm install
npm run dev
```

## Also in this folder

- `dashboard/` — the "Rivers Inflate Countries" dashboard page, its data, and the bundled world outlines.
- `mockup/` — the River Glass liquid-glass mockup (phone and desktop screens).

The template's own notes are in `docs/`. Licensed MIT (see `LICENSE`).
