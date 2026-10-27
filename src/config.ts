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
   * What an arc means, in words. Selecting an item draws arcs from its hub to each node it links to.
   * item: the item's side ("Release screened at 5 festivals"). node: the node's side ("3 releases screened here").
   * The legend at the bottom reads "release screened at festival" from these, so a visitor never has to guess.
   */
  link: { item: "pinned at", node: "pinned here" },

  /**
   * Set to true while the app shows sample data: a "Demo data" badge appears in the top bar and the
   * "Data from …" timestamp is hidden, so nobody mistakes the sample for live data. Remove it (or set false) with real data.
   */
  demo: false,

  /**
   * Dates on items drive the "recent" window, the Latest list, and the pulse on fresh hubs.
   * Set `enabled: false` if your items have no dates; those three parts are hidden.
   */
  dates: { enabled: false, recentDays: 15, latestDays: 7 },

  /** How many items fan out around a selected hub, and how many rows the Latest list shows. */
  fanLimit: 12,
  latestLimit: 50,

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
      { label: "Arcs", html: "An arc joins a river's mouth to the centre of a country it reaches. A shared river counts in full for each country it crosses." },
      { label: "Map", html: "Natural Earth country outlines, via world-atlas." },
      {
        label: "License",
        html: `© 2026 aunai-org. Code is <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer">MIT</a> licensed. <a href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">Third-party notices</a>.`,
      },
    ],
    disclaimer: "Figures are approximate. River mouths and country centres are map positions only.",
  },

  /** The credit in the footer. Leave `href` empty for plain text. */
  credit: { label: "Data", text: "approximate river lengths", href: "" },

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
