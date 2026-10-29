import { TTL_SECONDS, cacheKey, upstreamUrl } from "./flood";

/**
 * The site's only server code. Static files are served by Cloudflare itself; this Worker runs first only for
 * /api/flood, where it checks the request, answers from the edge cache when it can, and otherwise asks Open-Meteo
 * once and keeps the answer for everyone (see run_worker_first in wrangler.jsonc).
 */

type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };
type Context = { waitUntil(promise: Promise<unknown>): void };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const reply = (status: number, error: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...JSON_HEADERS, "cache-control": "no-store", ...extra } });

async function flood(request: Request, ctx: Context): Promise<Response> {
  if (request.method !== "GET") return reply(405, "GET only", { allow: "GET" });
  const upstream = upstreamUrl(new URL(request.url).searchParams);
  if (!upstream) return reply(400, "Not a request this site makes");

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(cacheKey(upstream));
  const hit = await cache.match(key);
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set("x-cache", "HIT");
    return new Response(hit.body, { status: hit.status, headers });
  }

  let res: Response;
  try {
    res = await fetch(upstream, { headers: { accept: "application/json" } });
  } catch {
    return reply(502, "Open-Meteo is unreachable");
  }
  // Errors are passed on, never cached, so the visitor's own retry (after a minute) gets a fresh try.
  if (res.status === 429) return reply(429, "Open-Meteo rate limit", { "retry-after": res.headers.get("retry-after") ?? "60" });
  if (!res.ok) return reply(502, `Open-Meteo answered ${res.status}`);

  const body = await res.text();
  const answer = () =>
    new Response(body, { status: 200, headers: { ...JSON_HEADERS, "cache-control": `public, max-age=${TTL_SECONDS}` } });
  ctx.waitUntil(cache.put(key, answer()));
  const out = answer();
  out.headers.set("x-cache", "MISS");
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/flood") return flood(request, ctx);
    if (pathname.startsWith("/api/")) return reply(404, "No such endpoint");
    return env.ASSETS.fetch(request);
  },
};
