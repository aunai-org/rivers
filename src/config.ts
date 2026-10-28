import type { SpaceOptions } from "./space";

/**
 * Everything about this app that is not data or code: its name, what the three kinds are called,
 * the wording on screen, and how much of the atmosphere to draw. Start here for a new app.
 *
 * Text in `about.rows[].html` is inserted as HTML and is yours, not user data, so links are fine there.
 * Colours live in src/theme.ts (the 3D scene) and the top of src/style.css (the page).
 */

type KindName = { one: string; many: string };

export const config = {
  /** Prefix for browser storage keys (saved data, sound on/off). Change it per app so two apps on one domain don't clash. */
  id: "river-globe",
  name: "River Globe",
  tagline: "Countries by their longest river",
  /** The <meta name="description"> and the globe's accessible label. */
  description: "An interactive Earth showing the world's rivers and the countries they cross.",

  /**
   * What the three kinds are called. hub: pinned on the map, and its items fan out around it.
   * item: belongs to a hub. node: pinned elsewhere, linked to items by arcs.
   */
  kinds: {
    hub: { one: "River", many: "Rivers" },
    item: { one: "Country", many: "Countries" },
    node: { one: "Country centre", many: "Country centres" },
  } satisfies Record<"hub" | "item" | "node", KindName>,

  /**
   * Set to true while the app shows sample data: a "Demo data" badge appears in the top bar and the
   * "Data from …" timestamp is hidden, so nobody mistakes the sample for live data. Remove it (or set false) with real data.
   */
  demo: false,

  /** An open tab quietly checks for newer data this often. */
  refreshMinutes: 30,

  /** The space backdrop. Each part can be turned down or off. See SpaceOptions in src/space.ts. */
  space: { meteors: 2, asteroids: 3, satellites: 6, milkyWay: true } satisfies SpaceOptions,

  about: {
    blurb:
      "The world's longest rivers and the countries they cross. Each country can be resized by its longest river instead of its land area.",
    rows: [
      { label: "Data", html: "Land areas and river lengths in <code>data/rivers.csv</code>. They are approximate, written from memory." },
      { label: "Inflation", html: "A country's share of the total river length divided by its share of the total land area. Above 1 it grows when resized by its river." },
      { label: "Select", html: "Click a country's name to see only the rivers that cross it, or click a river to see it alone. A shared river counts in full for each country it crosses." },
      { label: "Map", html: "Natural Earth country outlines, via world-atlas." },
      {
        label: "Inflate",
        html: "An area cartogram: each country in the table gets an area in proportion to its longest river; the rest shrink to 35%. Pins and rivers move with the land.",
      },
      {
        label: "River flow",
        html: `Natural Earth river lines (50m), each drawn from source to mouth. Width and pace follow today's discharge from the <a href="https://open-meteo.com/en/docs/flood-api" target="_blank" rel="noopener noreferrer">Open-Meteo Flood API</a> (GloFAS model, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>). These are modelled values, not gauge readings. Turning the view on is the only time the page contacts another site.`,
      },
      {
        label: "License",
        html: `© 2026 aunai-org. Code is <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT</a> licensed. <a href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">Third-party notices</a>.`,
      },
    ],
    disclaimer: "Figures are approximate. River mouths and country centres are map positions only.",
  },

  /** The credit in the footer. Leave `href` empty for plain text. */
  credit: { label: "Data", text: "approximate river lengths", href: "" },

  /** The search box: it finds a country or a river and selects it. */
  search: "Country or river",

  /** The View toggles in the Filters panel: the inflated map, and the live river layer. */
  views: {
    label: "View",
    inflate: "Inflate by river",
    inflateTitle: "Resize every country by the length of its longest river instead of its land area",
    bandsLabel: "Longest river",
    flow: "River flow",
    flowTitle: "Draw the world's major rivers flowing from source to mouth, sized by today's modelled discharge",
    live: "live",
    model: "model",
    loading: "…",
    offline: "no data",
  },

  /** The card that explains the inflated map while it is on. */
  inflateCard: {
    title: "Inflated by river",
    text: "Each country is redrawn so its area matches the length of its longest river, not its land. Countries that grow have long rivers for their size; countries outside the table shrink to 35%.",
    note: "Colour = length of the country's longest river. Figures are approximate.",
  },

  /** The flow legend, shown while rivers are on the globe. */
  flowCard: {
    title: "River flow",
    live: (date: string) => `Today's discharge · GloFAS model · ${date}`,
    loading: "Loading today's discharge…",
    offline: "Today's discharge is unavailable; widths follow river size.",
    off: "Lines only. Turn on River flow · live to size each river by today's water.",
    how: "Rivers draw out from source to mouth and pulses run downstream. Wider and faster means more water.",
    scale: [1_000, 10_000, 100_000],
    all: "Most water today",
    longest: "Longest rivers",
    inCountry: (name: string) => `Rivers in ${name}`,
    river: "Selected river",
    count: (n: number, of: number) => `${n} of ${of} rivers have a value today. Modelled, not gauged.`,
  },

  /** Status and notice wording. */
  copy: {
    loading: "Loading…",
    demo: "Demo data",
    demoTitle: "This is made-up sample data, not real",
    stamp: (time: string) => `Data from ${time}`,
    refreshTitle: "Check for newer data",
    upToDate: "Up to date",
    offline: (time: string) => `Offline · showing saved data${time ? ` from ${time}` : ""}.`,
    failed: "Data request failed.",
    noWebGL: "WebGL is unavailable.",
  },
};
