import { readFileSync } from "node:fs";
import type { Dataset, HubRow, ItemRow, LinkRow, NodeRow } from "../src/data";

/**
 * Rivers and the countries they cross.
 *
 *   river (hub, pinned at its mouth)  ──►  country (item, fans out around the river)  ──►  country pin (node)
 *
 * data/rivers.csv holds each country's land area and the length of its longest river. The figures are approximate,
 * written from memory, and a shared river counts in full for every country it crosses.
 * "Inflation" is a country's share of the total river length divided by its share of the total land area:
 * above 1 the country grows when it is resized by its river, below 1 it shrinks.
 */

/** Where each river reaches the sea (or its big confluence), as a map position. */
const MOUTH: Record<string, [lat: number, lng: number]> = {
  "Ob-Irtysh": [66.6, 72.5],
  Mackenzie: [69.3, -134.1],
  "Missouri-Mississippi": [29.1, -89.2],
  Yangtze: [31.4, 121.9],
  Amazon: [-0.1, -49.0],
  "Murray-Darling": [-35.5, 138.9],
  Ganges: [22.0, 90.5],
  Parana: [-34.0, -58.4],
  Irtysh: [61.0, 69.0],
  Congo: [-6.0, 12.4],
  Nile: [31.0, 31.0],
  Selenga: [52.4, 106.3],
  Niger: [5.0, 6.2],
  Magdalena: [11.1, -74.9],
  Indus: [24.0, 67.5],
  Zambezi: [-18.8, 36.2],
  Dnieper: [46.5, 32.3],
  Loire: [47.3, -2.2],
  Mekong: [9.7, 106.5],
  Euphrates: [31.0, 47.4],
  Shinano: [37.9, 139.0],
  Danube: [45.2, 29.7],
  Vistula: [54.35, 18.95],
  Po: [44.97, 12.5],
  Severn: [51.5, -2.7],
  Brahmaputra: [23.5, 90.5],
  Tagus: [38.7, -9.2],
  Rhine: [51.97, 4.1],
  Moselle: [50.37, 7.6],
};

/** A point near the middle of each country, used only as its map position. */
const CENTRE: Record<string, [lat: number, lng: number]> = {
  Russia: [61.5, 105],
  Canada: [56, -106],
  "United States": [39.8, -98.6],
  China: [35, 103],
  Brazil: [-10, -52],
  Australia: [-25, 134],
  India: [22, 79],
  Argentina: [-34, -64],
  Kazakhstan: [48, 67],
  "DR Congo": [-2.9, 23.7],
  Sudan: [15, 30],
  Mongolia: [46.9, 103.8],
  Peru: [-9.2, -75],
  Mali: [17.6, -4],
  Colombia: [4.6, -74],
  Egypt: [26.8, 30.8],
  Nigeria: [9.1, 8.7],
  Pakistan: [30.4, 69.3],
  Zambia: [-13.1, 27.8],
  Ukraine: [49, 32],
  France: [46.6, 2.2],
  Thailand: [15.9, 101],
  Iraq: [33, 43.7],
  Japan: [36.2, 138.3],
  Germany: [51.2, 10.4],
  Vietnam: [14, 108],
  Poland: [52, 19.1],
  Italy: [42.8, 12.6],
  "United Kingdom": [54, -2],
  Bangladesh: [23.7, 90.4],
  Hungary: [47.2, 19.5],
  Portugal: [39.6, -8],
  Netherlands: [52.1, 5.3],
  Switzerland: [46.8, 8.2],
  Luxembourg: [49.8, 6.1],
};

type Row = { country: string; area: number; river: string; km: number };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const num = (n: number) => n.toLocaleString("en-US");

function readRows(): Row[] {
  const lines = readFileSync(new URL("./rivers.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const [country, area, river, km] = line.split(",");
    return { country, area: Number(area), river, km: Number(km) };
  });
}

export async function buildDataset(): Promise<Dataset> {
  const rows = readRows();
  const totalArea = rows.reduce((s, r) => s + r.area, 0);
  const totalKm = rows.reduce((s, r) => s + r.km, 0);
  const inflation = (r: Row) => r.km / totalKm / (r.area / totalArea);

  const hubs: HubRow[] = [];
  const items: ItemRow[] = [];
  const nodes: NodeRow[] = [];
  const links: LinkRow[] = [];

  for (const r of rows) {
    const mouth = MOUTH[r.river];
    const centre = CENTRE[r.country];
    if (!mouth) throw new Error(`no mouth position for river ${r.river}`);
    if (!centre) throw new Error(`no map position for country ${r.country}`);

    const hubId = slug(r.river);
    if (!hubs.some((h) => h.id === hubId)) {
      const crossed = rows.filter((x) => x.river === r.river).map((x) => x.country);
      hubs.push({
        id: hubId,
        name: r.river,
        lat: mouth[0],
        lng: mouth[1],
        place: "River mouth",
        facts: [
          ["Length", `${num(r.km)} km`],
          ["Crosses", crossed.join(", ")],
        ],
      });
    }

    const x = inflation(r);
    const itemId = `c-${slug(r.country)}`;
    items.push({
      id: itemId,
      hub: hubId,
      name: r.country,
      facts: [
        ["Land area", `${num(r.area)} km²`],
        ["Longest river", `${r.river}, ${num(r.km)} km`],
        ["Inflation", `${x >= 10 ? Math.round(x) : x.toFixed(1)}× its land share`],
        ["Resized by river", x > 1 ? "Grows" : "Shrinks"],
      ],
    });

    const nodeId = `p-${slug(r.country)}`;
    nodes.push({ id: nodeId, name: r.country, lat: centre[0], lng: centre[1], place: "Country centre", facts: [["Land area", `${num(r.area)} km²`]] });
    links.push({ item: itemId, node: nodeId });
  }

  return { updatedAt: new Date().toISOString(), hubs, items, nodes, links };
}
