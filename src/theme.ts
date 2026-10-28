/**
 * Colours the 3D scene uses. The page's own colours live as CSS variables at the top of style.css;
 * keep `accent` and `node` in step with `--accent` and `--node` there.
 */
export const THEME = {
  /** The selection, pulses, and the highlight on the logo. */
  accent: "#f5a04a",
  /** Ordinary markers. */
  ink: "#f4f4f4",
  /** Markers that are on the map for orientation only. */
  dim: "#6b7178",
  /** Secondary markers (nodes) and the arcs that reach them. */
  node: "#9ecbff",
  /** Fill behind every marker icon. */
  plate: "#101114",
  /** Font for the numbers on cluster badges. */
  font: '"IBM Plex Mono", monospace',
} as const;

export type Mode = "dark" | "light";

export type ScenePalette = {
  /** Behind the globe. Dark mode also draws the stars there. */
  sky: string;
  /** The globe's surface, drawn from country outlines. */
  sea: string;
  land: readonly string[];
  border: string;
  /** Inflated-map colour per river-length band, short to long. */
  bands: readonly string[];
  /** The flowing river layer, and the head of each pulse that runs down it. */
  river: string;
  head: string;
  /** The soft rim around the globe, and how strong it is. */
  glow: string;
  glowStrength: number;
};

/** Both looks. Dark: rivers glow over a night globe. Light: dark-blue rivers drawn over a pale paper map. */
export const SCENE: Record<Mode, ScenePalette> = {
  dark: {
    sky: "#000000",
    sea: "#07080b",
    land: ["#1c1e22", "#26282d", "#141618", "#2e3136", "#101214"],
    border: "#8b8e95",
    bands: ["#3b2a5c", "#2e5c8a", "#1f8a7a", "#7ab648", "#f2c94c"],
    river: "#3b82f6",
    head: "#c0ddff",
    glow: "#eef0f4",
    glowStrength: 0.4,
  },
  light: {
    // A muted slate, a step darker than the sea, so the pale globe stands out instead of the sky glaring.
    sky: "#b4c1cf",
    sea: "#c9d8e6",
    land: ["#f4f1ea", "#ece8df", "#f7f5f0", "#e6e2d8", "#efebe3"],
    border: "#9aa1aa",
    bands: ["#f6e27a", "#a8d672", "#5cc2a8", "#5b8fd6", "#8a5cc2"],
    river: "#1f5fbf",
    // Pastel red: a navy head vanished into the blue river on a pale map.
    head: "#f07a7a",
    glow: "#7aa7d9",
    glowStrength: 0.55,
  },
};

/** The mode to start in: the visitor's saved choice, else their system setting. */
export function initialMode(stored: string | null, systemDark: boolean): Mode {
  if (stored === "dark" || stored === "light") return stored;
  return systemDark ? "dark" : "light";
}

/** "#f5a04a" → 0xf5a04a, for three.js colours. */
export const hex = (css: string): number => parseInt(css.slice(1), 16);
