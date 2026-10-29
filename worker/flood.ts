/**
 * The pure half of the flood proxy: turn a visitor's query into the one Open-Meteo request the site is allowed to
 * make, or refuse it. Kept free of Worker APIs so it can be tested in Node.
 */

export const UPSTREAM = "https://flood-api.open-meteo.com/v1/flood";
/** The site sends 100 locations per request; more than that is not this site. */
export const MAX_LOCATIONS = 100;
/** GloFAS publishes a new daily value once a day, so a copy this old is as good as a fresh one. */
export const TTL_SECONDS = 6 * 3600;

const list = (raw: string | null, limit: number): number[] | null => {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length > MAX_LOCATIONS) return null;
  const nums = parts.map((p) => (p.trim() === "" ? NaN : Number(p)));
  return nums.every((n) => Number.isFinite(n) && Math.abs(n) <= limit) ? nums : null;
};

/** The upstream URL for a visitor's query, with only the four parameters the site uses; null when it is not one. */
export function upstreamUrl(query: URLSearchParams): URL | null {
  if (query.get("daily") !== "river_discharge" || query.get("forecast_days") !== "1") return null;
  const lat = list(query.get("latitude"), 90);
  const lng = list(query.get("longitude"), 180);
  if (!lat || !lng || lat.length !== lng.length) return null;
  const url = new URL(UPSTREAM);
  url.searchParams.set("latitude", lat.map((n) => n.toFixed(3)).join(","));
  url.searchParams.set("longitude", lng.map((n) => n.toFixed(3)).join(","));
  url.searchParams.set("daily", "river_discharge");
  url.searchParams.set("forecast_days", "1");
  return url;
}

/** Visitors asking for the same points, in any parameter order, share this key. */
export const cacheKey = (url: URL): string => url.href;
