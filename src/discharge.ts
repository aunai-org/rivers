import type { RiversAsset } from "./data";

/**
 * Today's river discharge, from the Open-Meteo Flood API (GloFAS v4 model, CC BY 4.0). It is a modelled daily value
 * on a ~5 km grid, not a gauge reading. Each river is sampled at a few points near its mouth and the largest value
 * wins, because a sample point can land on a grid cell beside the channel.
 */

/** The site's own proxy (worker/index.ts), which asks Open-Meteo and shares the answer between visitors. */
export const FLOOD_API = "/api/flood";
/** Locations per request; Open-Meteo takes comma-separated lists. */
const CHUNK = 100;
/**
 * The free API allows about 600 locations a minute, and every location counts. Big rivers (rank ≤ 4) are sampled
 * at two points 6% and 10% of their length up from the mouth, the rest at one, which keeps a full load near 470.
 */
const BIG_RANK = 4;
/** A refused batch (rate limit, network) is tried once more after the limit's minute has passed. */
const RETRY_MS = 65_000;
/** The second pass stays under the minute's limit. */
const SECOND_PASS = 560;
/** Where a dry-looking river is sampled again, degrees [lat, lng] from its gauge: one and two model cells away. */
const NUDGE: [number, number][] = [
  [0, 0.05],
  [0, -0.05],
  [0.05, 0],
  [-0.05, 0],
  [0, 0.1],
  [0, -0.1],
  [0.1, 0],
  [-0.1, 0],
];
/** A saved answer is reused this long. */
const KEEP_MS = 6 * 3_600_000;

export type Flow = { q: number; date: string };

type Answer = { daily?: { time?: string[]; river_discharge?: (number | null)[] } };

function readCache(key: string): Map<string, Flow> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; flows: [string, Flow][] } | null;
    return saved && Date.now() - saved.at < KEEP_MS ? new Map(saved.flows) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, flows: Map<string, Flow>) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), flows: [...flows] }));
  } catch {
    // Storage full or blocked: the next visit fetches again.
  }
}

/**
 * Discharge by river name. `onPart` sees the map grow as each batch lands. Throws when nothing could be fetched.
 */
export async function fetchDischarge(
  rivers: RiversAsset["rivers"],
  cacheKey: string,
  onPart?: (flows: Map<string, Flow>) => void,
): Promise<Map<string, Flow>> {
  const cached = readCache(cacheKey);
  if (cached) return cached;
  const spots = rivers.flatMap((r) =>
    (r.rank <= BIG_RANK ? r.gauges.slice(1, 3) : r.gauges.slice(1, 2)).map((g) => ({ name: r.name, lat: g[0], lng: g[1] })),
  );
  const batch = (list: typeof spots) => {
    const out: (typeof spots)[] = [];
    for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
    return out;
  };
  const chunks = batch(spots);

  const flows = new Map<string, Flow>();
  const run = async (chunk: typeof spots): Promise<boolean> => {
    const url = new URL(FLOOD_API, location.origin);
    url.searchParams.set("latitude", chunk.map((s) => s.lat.toFixed(3)).join(","));
    url.searchParams.set("longitude", chunk.map((s) => s.lng.toFixed(3)).join(","));
    url.searchParams.set("daily", "river_discharge");
    url.searchParams.set("forecast_days", "1");
    try {
      const res = await fetch(url, { referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Answer | Answer[];
      const answers = Array.isArray(body) ? body : [body];
      answers.forEach((a, i) => {
        const q = a.daily?.river_discharge?.at(-1);
        const date = a.daily?.time?.at(-1);
        const spot = chunk[i];
        if (!spot || typeof q !== "number" || !date) return;
        const best = flows.get(spot.name);
        if (!best || q > best.q) flows.set(spot.name, { q, date });
      });
      onPart?.(flows);
      return true;
    } catch {
      return false;
    }
  };
  const refused: typeof spots = [];
  for (const chunk of chunks) if (!(await run(chunk))) refused.push(...chunk);

  // Second pass, once the rate limit's minute is over: refused batches again, then rivers that came back dry or
  // missing, sampled 0.1° around their first point (the model's channel can sit a cell off Natural Earth's line).
  const dry = rivers
    .filter((r) => !((flows.get(r.name)?.q ?? 0) >= 1))
    .sort((a, b) => a.rank - b.rank)
    .flatMap((r) => {
      const [lat, lng] = r.gauges[1] ?? r.gauges[0];
      return NUDGE.map(([dy, dx]) => ({ name: r.name, lat: lat + dy, lng: lng + dx }));
    });
  const second = [...refused, ...dry].slice(0, SECOND_PASS);
  let complete = !refused.length;
  if (second.length) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    complete = true;
    for (const chunk of batch(second)) if (!(await run(chunk))) complete = false;
  }
  if (!flows.size) throw new Error("discharge unavailable");
  // Only a complete answer is kept, so a partial one is retried on the next visit.
  if (complete) writeCache(cacheKey, flows);
  return flows;
}
