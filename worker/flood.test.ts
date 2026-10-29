import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, upstreamUrl } from "./flood.ts";

const q = (s: string) => new URLSearchParams(s);
const ok = "latitude=1.5,-2.25&longitude=30,40.1234&daily=river_discharge&forecast_days=1";

test("a valid request becomes an Open-Meteo flood URL with coordinates at 3 decimals", () => {
  const url = upstreamUrl(q(ok));
  assert.ok(url);
  assert.equal(url.origin + url.pathname, "https://flood-api.open-meteo.com/v1/flood");
  assert.equal(url.searchParams.get("latitude"), "1.500,-2.250");
  assert.equal(url.searchParams.get("longitude"), "30.000,40.123");
  assert.equal(url.searchParams.get("daily"), "river_discharge");
  assert.equal(url.searchParams.get("forecast_days"), "1");
});

test("anything but river_discharge for one day is refused", () => {
  assert.equal(upstreamUrl(q(ok.replace("river_discharge", "temperature_2m_max"))), null);
  assert.equal(upstreamUrl(q(ok.replace("forecast_days=1", "forecast_days=92"))), null);
});

test("bad coordinates are refused: counts differ, out of range, not numbers, or too many", () => {
  assert.equal(upstreamUrl(q("latitude=1,2&longitude=3&daily=river_discharge&forecast_days=1")), null);
  assert.equal(upstreamUrl(q("latitude=91&longitude=3&daily=river_discharge&forecast_days=1")), null);
  assert.equal(upstreamUrl(q("latitude=1&longitude=181&daily=river_discharge&forecast_days=1")), null);
  assert.equal(upstreamUrl(q("latitude=abc&longitude=3&daily=river_discharge&forecast_days=1")), null);
  assert.equal(upstreamUrl(q("latitude=&longitude=&daily=river_discharge&forecast_days=1")), null);
  const many = Array.from({ length: 101 }, () => "1").join(",");
  assert.equal(upstreamUrl(q(`latitude=${many}&longitude=${many}&daily=river_discharge&forecast_days=1`)), null);
});

test("extra parameters are dropped, so they cannot be used to reach other API features", () => {
  const url = upstreamUrl(q(ok + "&apikey=x&past_days=90&models=seamless_v4"))!;
  assert.deepEqual([...url.searchParams.keys()].sort(), ["daily", "forecast_days", "latitude", "longitude"]);
});

test("visitors asking for the same points share one cache key, whatever the parameter order", () => {
  const a = cacheKey(upstreamUrl(q(ok))!);
  const b = cacheKey(upstreamUrl(q("forecast_days=1&daily=river_discharge&longitude=30.0004,40.1234&latitude=1.5,-2.25"))!);
  assert.equal(a, b);
  assert.notEqual(a, cacheKey(upstreamUrl(q(ok.replace("1.5,", "1.6,")))!));
});
