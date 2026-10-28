import { Globe, RADIUS } from "./globe";
import { RiverFlow } from "./flow";
import { fetchDischarge } from "./discharge";
import { config } from "./config";
import { INFLATE_URL, RIVERS_URL, type RiversAsset, fetchDataset, readSaved, save, type Dataset, type Fact, type HubRow, type InflateAsset, type ItemRow, type NodeRow } from "./data";
import { flowWidth } from "./flowmath";
import { BAND_LABELS, BANDS, bandColour } from "./inflate";
import { CountryLabels } from "./labels";
import { LOGO_SVG } from "./logo";
import { riversShown } from "./select";
import { cueClear, cueOpen, cueSelect, cueTick, initSound, setSound, soundOn } from "./sound";
import { initialMode, type Mode } from "./theme";

const K = config.kinds;
/** Windows shorter than this fold the side panels when a card opens. */
const SHORT_PX = 640;
/** Narrower windows use the compact layout: panels folded, the globe centred beside the card. */
const COMPACT_PX = 1000;
/** Narrower than this the card is a bottom sheet. */
const SHEET_PX = 600;
/** Rows in the flow legend's list, and in a country card's list of rivers. */
const LIST_ROWS = 8;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector(selector) as T;
const low = (text: string) => text.toLowerCase();

const statusEl = $("#status");
const clockEl = $("#clock");
const cardEl = $("#card");
const searchEl = $<HTMLInputElement>("#search");
const refreshEl = $<HTMLButtonElement>("#refresh");
const filtersEl = $<HTMLDetailsElement>(".filters");
const appEl = $("#app");
const aboutEl = $("#about");
const aboutBtn = $<HTMLButtonElement>("#about-btn");
const soundEl = $<HTMLButtonElement>("#sound");
const inflateEl = $<HTMLButtonElement>("#view-inflate");
const flowEl = $<HTMLButtonElement>("#view-flow");
const inflateCard = $<HTMLDetailsElement>("#inflate-card");
const flowCard = $<HTMLDetailsElement>("#flow-card");

function setText(selector: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

/** Fills every piece of wording and the logo from src/config.ts, so the HTML holds only structure. */
function paintChrome() {
  document.title = `${config.name} — ${config.tagline}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", config.description);
  $("#globe").setAttribute("aria-label", config.description);
  document.querySelectorAll(".logo-slot").forEach((slot) => (slot.innerHTML = LOGO_SVG));
  setText("#boot-name", config.name.toUpperCase());
  setText("#brand-name", config.name.toUpperCase());
  setText("#boot-msg", config.copy.loading);
  setText("#tagline", config.tagline);
  setText("#status", config.copy.loading);
  aboutBtn.setAttribute("aria-label", `About ${config.name}`);
  aboutBtn.title = `About ${config.name}`;
  refreshEl.title = config.copy.refreshTitle;
  refreshEl.setAttribute("aria-label", config.copy.refreshTitle);
  searchEl.placeholder = config.search;
  searchEl.setAttribute("aria-label", config.search);

  const V = config.views;
  setText("#lbl-view", V.label);
  setText("#lbl-inflate", V.inflate);
  setText("#lbl-flow", V.flow);
  inflateEl.title = V.inflateTitle;
  flowEl.title = V.flowTitle;

  const I = config.inflateCard;
  setText("#ic-title", I.title);
  setText("#ic-text", I.text);
  setText("#ic-note", I.note);
  const bands = $("#bands");
  const head = document.createElement("span");
  head.textContent = V.bandsLabel;
  bands.append(head);
  BAND_LABELS.forEach((label, i) => {
    const row = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.dataset.km = String(i ? BANDS[i - 1] : 0);
    row.append(swatch, label);
    bands.append(row);
  });

  const F = config.flowCard;
  setText("#fc-title", F.title);
  setText("#fc-how", F.how);
  const scale = $("#fc-scale");
  const widest = flowWidth(F.scale[F.scale.length - 1], 1);
  for (const q of F.scale) {
    const row = document.createElement("span");
    const bar = document.createElement("i");
    bar.style.height = `${Math.max(1, (flowWidth(q, 1) / widest) * 7).toFixed(1)}px`;
    row.append(bar, m3s(q));
    scale.append(row);
  }

  setText("#about-title", config.name);
  setText("#about-blurb", config.about.blurb);
  setText("#about-disclaimer", config.about.disclaimer);
  const rows = $("#about-rows");
  for (const row of config.about.rows) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = row.label;
    const dd = document.createElement("dd");
    dd.innerHTML = row.html;
    wrap.append(dt, dd);
    rows.append(wrap);
  }
  const demoBadge = $("#demo-badge");
  demoBadge.hidden = !config.demo;
  demoBadge.textContent = config.copy.demo;
  demoBadge.title = config.copy.demoTitle;
  const credit = $("#credit");
  credit.append(`${config.credit.label} `);
  if (config.credit.href) {
    const link = document.createElement("a");
    link.href = config.credit.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = config.credit.text;
    credit.append(link);
  } else {
    credit.append(config.credit.text);
  }
}

const m3s = (q: number) => `${Math.round(q).toLocaleString("en-US")} m³/s`;
const kms = (km: number) => `${km.toLocaleString("en-US")} km`;

paintChrome();
initSound(config.id);

// Small screens start with the side panels folded, so the globe is what you see first.
if (window.innerHeight < SHORT_PX || window.innerWidth < COMPACT_PX) filtersEl.open = false;
if (window.innerWidth < SHEET_PX) {
  inflateCard.open = false;
  flowCard.open = false;
}

// ---- State ---------------------------------------------------------------------------------------------------------

let hubs: HubRow[] = [];
let nodes: NodeRow[] = [];
let nodeById = new Map<string, NodeRow>();
/** A country's row in the table (its land, longest river and inflation), by its centre's id. */
let itemByNode = new Map<string, ItemRow>();

/** The selected country (a country centre's id) and river (a river line's name). A river wins over a country. */
let countryId: string | null = null;
let riverName: string | null = null;
let updatedAt = "";
let notice = "";
/** The land is (or is turning) inflated by river. */
let inflated = false;
/** The inflated outlines and pin positions, loaded the first time the view is turned on. */
let shapes: InflateAsset | null = null;
/** The live River flow view is on: today's discharge is fetched and sizes the rivers. */
let flowing = false;
/** River lines, loaded the first time rivers are needed (the flow view, or a selection). */
let rivers: RiversAsset | null = null;
let flowState = "";

function useData(data: Dataset) {
  hubs = data.hubs;
  nodes = data.nodes;
  updatedAt = data.updatedAt ?? "";
  nodeById = new Map(nodes.map((row) => [row.id, row]));
  const itemById = new Map(data.items.map((row) => [row.id, row]));
  itemByNode = new Map();
  for (const link of data.links) {
    const item = itemById.get(link.item);
    if (item && !itemByNode.has(link.node)) itemByNode.set(link.node, item);
  }
  paintSearchList();
}

// ---- Data helpers --------------------------------------------------------------------------------------------------

const spot = (row: { lat?: number; lng?: number }) =>
  typeof row.lat === "number" && typeof row.lng === "number" ? { lat: row.lat, lng: row.lng } : null;

const factOf = (facts: Fact[] | undefined, label: string) => facts?.find(([name]) => name === label)?.[1];

/** Where a country's centre sits when the land is inflated, if the inflated map knows it. */
function altOf(id: string) {
  const at = shapes?.points[`node:${id}`];
  return at ? { lat: at[0], lng: at[1] } : undefined;
}

/** Where to turn the camera for a country: its inflated centre while the land is inflated. */
function aim(row: NodeRow | undefined) {
  const place = row ? spot(row) : null;
  return place && inflated ? (altOf(row!.id) ?? place) : place;
}

const clock = (date: Date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const riverByName = (name: string | null) => (name && rivers?.rivers.find((r) => r.name === name)) || null;

/** The selected country's rivers, the selected river, or every river; most water first, else longest first. */
function listedRivers(): RiversAsset["rivers"] {
  if (!rivers) return [];
  const shown = riversShown(rivers.rivers, { country: countryName() });
  const list = shown ? rivers.rivers.filter((_, i) => shown.has(i)) : rivers.rivers;
  const q = (name: string) => riverFlow.flowOf(name)?.q ?? -1;
  return [...list].sort((a, b) => q(b.name) - q(a.name) || b.km - a.km);
}

/** A short fingerprint of the river names (djb2), for the discharge cache key. */
function nameHash(list: { name: string }[]): string {
  let h = 5381;
  for (const ch of list.map((r) => r.name).join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

const countryName = () => (countryId ? (nodeById.get(countryId)?.name ?? null) : null);

// ---- The globe -----------------------------------------------------------------------------------------------------

const globe = new Globe($("#globe"), {
  space: config.space,
  kinds: {
    hub: { name: [low(K.hub.one), low(K.hub.many)] },
    item: { name: [low(K.item.one), low(K.item.many)] },
    node: { name: [low(K.node.one), low(K.node.many)] },
  },
  // There are no markers on this globe: countries are picked by their labels, rivers by their lines.
  onPick: () => {},
  onEmpty: () => {
    // Clicking empty globe drops the selection and closes the card.
    if (!countryId && !riverName) return;
    cueClear();
    countryId = null;
    riverName = null;
    render();
  },
});

// Country names, at each country's centre. They slide with the land when it inflates.
const labels = new CountryLabels($("#globe"), (id) => pickCountry(id));

// The river layer: drawn over the globe, following the land's morph.
const riverFlow = new RiverFlow(RADIUS, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
globe.addLayer(riverFlow.mesh);
globe.onFrame = (now, t) => riverFlow.update(now, t, globe.cameraDistance);
globe.onDraw = (camera, width, height, t) => labels.update(camera, width, height, t);
globe.probe = (x, y, camera, width, height) => {
  const hit = riverFlow.hit(x, y, camera, width, height, globe.inflation);
  if (!hit) return null;
  const today = hit.flow ? `${m3s(hit.flow.q)} on ${hit.flow.date}` : flowing ? config.views.offline : "";
  return `${hit.name}
${[kms(hit.km), today].filter(Boolean).join(" · ")}`;
};
globe.onLayerPick = (x, y, camera, width, height) => {
  const hit = riverFlow.hit(x, y, camera, width, height, globe.inflation);
  if (!hit) return false;
  // A river outside the selected country's rivers can't be hit (it isn't drawn), so the country stays selected.
  pickRiver(hit.name);
  return true;
};
if (import.meta.env.DEV) Object.assign(window as object, { __globe: globe, __flow: riverFlow, __labels: labels });

function pickCountry(id: string) {
  if (!nodeById.has(id)) return;
  cueSelect();
  countryId = id;
  riverName = null;
  const place = aim(nodeById.get(id));
  if (place) globe.focus(place.lat, place.lng);
  render();
  void needRivers();
}

function pickRiver(name: string) {
  cueOpen();
  riverName = name;
  // A river from another country's list leaves that country behind.
  const country = countryName();
  const river = riverByName(name);
  if (country && river && !river.countries.includes(country)) countryId = null;
  if (river) frameRiver(river);
  render();
}

/** Turn and zoom the globe so a whole river is in view. */
function frameRiver(river: RiversAsset["rivers"][number]) {
  const spots: { lat: number; lng: number }[] = [];
  for (const line of river.lines) {
    const flat = inflated ? line.inflated : line.real;
    const step = Math.max(2, Math.floor(flat.length / 40) * 2);
    for (let i = 0; i < flat.length; i += step) spots.push({ lat: flat[i + 1], lng: flat[i] });
  }
  globe.frame(spots);
}

/** Load the river lines once; until they arrive a selection shows its card but no rivers. */
let riversLoading: Promise<RiversAsset> | null = null;
async function needRivers(): Promise<RiversAsset | null> {
  if (rivers) return rivers;
  riversLoading ??= fetch(RIVERS_URL).then((res) => {
    if (!res.ok) throw new Error(`rivers request failed: ${res.status}`);
    return res.json() as Promise<RiversAsset>;
  });
  try {
    rivers = await riversLoading;
  } catch {
    riversLoading = null;
    return null;
  }
  riverFlow.setData(rivers);
  paintSearchList();
  render();
  return rivers;
}

/**
 * Everything on screen follows the selection: the labels, which rivers are drawn, the card, and the flow legend.
 * Nothing selected → every river (while River flow is on). A country → the rivers that cross it. A river → only it.
 */
function render() {
  labels.set(
    nodes.flatMap((row) => {
      const place = spot(row);
      if (!place) return [];
      const item = itemByNode.get(row.id);
      const area = Number((factOf(item?.facts, "Land area") ?? "0").replace(/\D/g, ""));
      // While the land is inflated each label also names the river that sized its country.
      const sub = inflated ? factOf(item?.facts, "Longest river") : undefined;
      return [{ id: row.id, text: row.name, sub, ...place, alt: altOf(row.id), weight: area }];
    }),
  );
  labels.select(countryId);

  const selecting = !!(countryId || riverName);
  if (rivers) riverFlow.setShown(riversShown(rivers.rivers, { country: countryName(), river: riverName }));
  riverFlow.setVisible(!!rivers && (flowing || selecting));

  paintCard();
  paintFlowCard();
  paintStatus();
  fitPanels();
}

function paintStatus() {
  if (!clockHold) clockEl.textContent = stampText();
  const riverCount = rivers?.rivers.length ?? hubs.length;
  if (!globe.ready) statusEl.textContent = config.copy.noWebGL;
  else if (notice) statusEl.textContent = notice;
  else statusEl.textContent = `${nodes.length} ${low(K.item.many)} · ${riverCount} ${low(K.hub.many)}`;
}

/** The search box suggests every country and river; choosing one selects it. */
function paintSearchList() {
  const names = [...nodes.map((row) => row.name), ...(rivers?.rivers.map((r) => r.name) ?? hubs.map((row) => row.name))];
  $("#search-list").replaceChildren(
    ...[...new Set(names)].map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }),
  );
}

async function find(text: string) {
  const q = low(text.trim());
  if (!q) return;
  const country = nodes.find((row) => low(row.name) === q) ?? nodes.find((row) => low(row.name).startsWith(q));
  if (country) {
    pickCountry(country.id);
    return;
  }
  const all = await needRivers();
  const river = all?.rivers.find((r) => low(r.name) === q) ?? all?.rivers.find((r) => low(r.name).startsWith(q));
  if (river) pickRiver(river.name);
}

// ---- The card ------------------------------------------------------------------------------------------------------

/** A river's card when one is selected, else the selected country's card. */
function paintCard() {
  const river = riverByName(riverName);
  const country = countryId ? (nodeById.get(countryId) ?? null) : null;
  cardEl.hidden = !river && !country;
  if (cardEl.hidden) return;
  const body = $("#card-body");
  body.replaceChildren();
  const kind = (label: string, id: string) => {
    setText("#card-id", label.toUpperCase());
    setText("#card-sub", `inspect ${low(label)} ${id}`);
  };

  if (river) {
    const hub = river.hub ? hubs.find((row) => row.id === river.hub) : undefined;
    kind(K.hub.one, river.hub ?? low(river.name).replace(/\W+/g, "-"));
    setText("#card-name", river.name);
    setText("#card-when", `${kms(river.km)} mapped · ${river.countries.length} ${low(river.countries.length === 1 ? K.item.one : K.item.many)}`);
    const length = factOf(hub?.facts, "Length");
    if (length) addFact(body, "Length", `${length} (table)`);
    addFact(body, "Crosses", river.countries.join(" → ") || "—");
    const flow = riverFlow.flowOf(river.name);
    if (flow) {
      addFact(body, "Flow today", `${m3s(flow.q)} · ${flow.date}`);
      addFact(body, "Flow source", "GloFAS model · Open-Meteo", "https://open-meteo.com/en/docs/flood-api");
    } else if (!flowing) {
      addFact(body, "Flow today", `Turn on ${config.views.flow}`, () => flowEl.click());
    } else {
      addFact(body, "Flow today", flowState === config.views.live ? config.views.offline : config.views.loading);
    }
    if (country) addFact(body, K.item.one, country.name, () => {
      riverName = null;
      cueClear();
      render();
    });
    return;
  }

  const item = itemByNode.get(country!.id);
  kind(K.item.one, country!.id);
  setText("#card-name", country!.name);
  setText("#card-when", factOf(item?.facts, "Longest river") ?? "");
  for (const [label, value, href] of item?.facts ?? []) if (label !== "Longest river") addFact(body, label, value, href);
  if (!rivers) {
    addFact(body, K.hub.many, config.views.loading);
    return;
  }
  // The rivers themselves are listed, with today's flow, in the River flow card.
  const own = listedRivers();
  addFact(body, `${K.hub.many} here`, String(own.length));
  if (own[0]) addFact(body, riverFlow.flowOf(own[0].name) ? "Most water" : "Longest", own[0].name, () => pickRiver(own[0].name));
}

function addFact(root: HTMLElement, label: string, value: string, target?: string | (() => void)) {
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  if (value === "Yes" || value === "Open") dd.className = "yes";
  else if (value === "No") dd.className = "no";
  if (typeof target === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fact-link";
    button.textContent = `${value} ↗`;
    button.addEventListener("click", target);
    dd.append(button);
  } else if (target?.startsWith("https://")) {
    // Only https links, so a data file can't smuggle in a javascript: URL.
    const link = document.createElement("a");
    link.href = target;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = value;
    dd.append(link);
  } else {
    dd.textContent = value;
  }
  row.append(dt, dd);
  root.append(row);
}

// ---- The side cards ------------------------------------------------------------------------------------------------

/** The flow legend: what width and pulses mean, where today's numbers come from, and the rivers in view by flow. */
function paintFlowCard() {
  flowCard.hidden = !riverFlow.visible;
  if (flowCard.hidden) return;
  const F = config.flowCard;
  const flows = riverFlow.allFlows;
  const date = flows.values().next().value?.date ?? "";
  const live = flowing && flowState === config.views.live && flows.size > 0;
  setText("#fc-badge", flowing ? flowState : "");
  setText("#fc-state", !flowing ? F.off : live ? F.live(date) : flowState === config.views.offline ? F.offline : F.loading);
  $("#fc-scale").hidden = !live;

  const river = riverByName(riverName);
  const list = river ? [river] : listedRivers();
  const name = countryName();
  setText("#fc-list-label", river ? F.river : name ? F.inCountry(name) : live ? F.all : F.longest);
  $("#fc-list").replaceChildren(
    ...list.slice(0, LIST_ROWS).map((r) => {
      const q = riverFlow.flowOf(r.name)?.q;
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("on", r.name === riverName);
      const label = document.createElement("span");
      label.textContent = r.name;
      const value = document.createElement("b");
      value.textContent = q ? m3s(q) : kms(r.km);
      button.append(label, value);
      button.addEventListener("click", () => pickRiver(r.name));
      const li = document.createElement("li");
      li.append(button);
      return li;
    }),
  );

  const source = $("#fc-source");
  source.replaceChildren();
  if (flowing) {
    const counted = list.filter((r) => flows.has(r.name)).length;
    const link = document.createElement("a");
    link.href = "https://open-meteo.com/en/docs/flood-api";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open-Meteo Flood API";
    const licence = document.createElement("a");
    licence.href = "https://creativecommons.org/licenses/by/4.0/";
    licence.target = "_blank";
    licence.rel = "noopener noreferrer";
    licence.textContent = "CC BY 4.0";
    source.append(`${F.count(counted, list.length)} `, link, " · ", licence);
  }
}

function paintInflateCard() {
  inflateCard.hidden = !inflated;
}

// ---- Responsive layout ---------------------------------------------------------------------------------------------

const compact = () => window.innerWidth < COMPACT_PX;
const sheet = () => window.innerWidth < SHEET_PX;

/**
 * Short or narrow windows can't fit the card and every panel. When a selection opens the card there,
 * fold the panels; the person can still reopen them.
 */
let lastCard = "";
function fitPanels() {
  const tight = window.innerHeight < SHORT_PX || compact();
  const card = cardEl.hidden ? "" : `${countryId}|${riverName}`;
  appEl.dataset.card = card ? "open" : "closed";
  if (tight && card && card !== lastCard) filtersEl.open = false;
  lastCard = card;
  capCard();
  placeGlobe();
}

/** Compact screens: centre the globe in the space the card leaves free. */
function placeGlobe() {
  const box = cardEl.hidden ? null : cardEl.getBoundingClientRect();
  const inset = !box ? { left: 0, bottom: 0 } : sheet() ? { left: 0, bottom: box.height } : { left: box.right, bottom: 0 };
  globe.setLayout(compact(), inset);
}

/** The card and the filters share the left edge; the card stops above the filters. */
function capCard() {
  if (sheet()) {
    // Bottom sheet: its height comes from CSS.
    cardEl.style.maxHeight = "";
    return;
  }
  const room = filtersEl.getBoundingClientRect().top - cardEl.getBoundingClientRect().top - 10;
  cardEl.style.maxHeight = `${Math.max(room, 120)}px`;
}

// ---- Loading -------------------------------------------------------------------------------------------------------

/** While set, the top-bar time shows a short message instead of the data time. */
let clockHold = 0;
/** The "Data from …" line. Sample data has no real time to show, so demo mode leaves it blank. */
function stampText() {
  return updatedAt && !config.demo ? config.copy.stamp(clock(new Date(updatedAt))) : "";
}
function flashClock(message: string) {
  window.clearTimeout(clockHold);
  clockEl.textContent = message;
  clockHold = window.setTimeout(() => {
    clockHold = 0;
    clockEl.textContent = stampText();
  }, 3500);
}

/**
 * Fetch the dataset. Quiet loads (the background refresh) leave the UI alone unless the data changed;
 * a failed fetch keeps whatever is on screen and says it is the saved copy.
 */
async function load(options: { quiet?: boolean; force?: boolean } = {}) {
  if (!options.quiet) {
    statusEl.textContent = config.copy.loading;
    refreshEl.classList.add("spin");
    refreshEl.disabled = true;
  }
  try {
    const data = await fetchDataset(options.force);
    const changed = data.updatedAt !== updatedAt;
    if (options.force && !changed) flashClock(config.copy.upToDate);
    const before = notice;
    if (data.hubs.length) {
      useData(data);
      save(config.id, data);
    }
    notice = "";
    if (!options.quiet || changed || notice !== before) render();
  } catch {
    notice = hubs.length ? config.copy.offline(updatedAt ? clock(new Date(updatedAt)) : "") : config.copy.failed;
    render();
  }
  refreshEl.classList.remove("spin");
  refreshEl.disabled = false;
  appEl.dataset.state = "ready";
}

// ---- Controls ------------------------------------------------------------------------------------------------------

searchEl.addEventListener("change", () => void find(searchEl.value));
searchEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void find(searchEl.value);
});
refreshEl.addEventListener("click", () => {
  cueTick();
  void load({ force: true });
});
document.querySelectorAll(".panel summary").forEach((summary) => summary.addEventListener("click", cueTick));
$("#card-close").addEventListener("click", () => {
  cueClear();
  if (riverName) riverName = null;
  else countryId = null;
  render();
});

function showAbout(open: boolean) {
  if (aboutEl.hidden === !open) return;
  aboutEl.hidden = !open;
  aboutBtn.setAttribute("aria-expanded", String(open));
  cueTick();
}
aboutBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  showAbout(aboutEl.hidden);
});
$("#about-close").addEventListener("click", () => showAbout(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") showAbout(false);
});
// A click anywhere outside the panel closes it, the globe included.
document.addEventListener("pointerdown", (event) => {
  const target = event.target as Node;
  if (!aboutEl.hidden && !aboutEl.contains(target) && !aboutBtn.contains(target)) showAbout(false);
});

function paintSound() {
  const on = soundOn();
  soundEl.setAttribute("aria-pressed", String(on));
  soundEl.setAttribute("aria-label", on ? "Sound on" : "Sound off");
  soundEl.title = on ? "Sound on" : "Sound off";
}
soundEl.addEventListener("click", () => {
  setSound(!soundOn());
  paintSound();
});
paintSound();

// ---- Light or dark ---------------------------------------------------------------------------------------------------

const MODE_KEY = "river-globe:theme";
const themeEl = $<HTMLButtonElement>("#theme");
let mode: Mode = initialMode(stored(), window.matchMedia("(prefers-color-scheme: dark)").matches);

function stored(): string | null {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

function applyMode() {
  document.documentElement.dataset.theme = mode;
  globe.setMode(mode);
  riverFlow.setMode(mode);
  document.querySelectorAll<HTMLElement>("#bands i").forEach((swatch) => {
    swatch.style.background = bandColour(Number(swatch.dataset.km), mode);
  });
  const next = mode === "dark" ? config.copy.lightMode : config.copy.darkMode;
  themeEl.setAttribute("aria-label", next);
  themeEl.title = next;
  themeEl.setAttribute("aria-pressed", String(mode === "light"));
}
themeEl.addEventListener("click", () => {
  mode = mode === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private windows can refuse storage; the switch still works for this visit.
  }
  applyMode();
});
applyMode();

// ---- Views --------------------------------------------------------------------------------------------------------

function paintViews() {
  inflateEl.classList.toggle("on", inflated);
  inflateEl.setAttribute("aria-pressed", String(inflated));
  paintInflateCard();
}

let shapesLoading: Promise<InflateAsset> | null = null;
async function loadShapes(): Promise<InflateAsset> {
  shapesLoading ??= fetch(INFLATE_URL).then((res) => {
    if (!res.ok) throw new Error(`inflate request failed: ${res.status}`);
    return res.json() as Promise<InflateAsset>;
  });
  return shapesLoading;
}

inflateEl.addEventListener("click", async () => {
  cueTick();
  const on = !inflated;
  if (on && !shapes) {
    inflateEl.setAttribute("aria-busy", "true");
    setText("#state-inflate", config.views.loading);
    try {
      shapes = await loadShapes();
      globe.setShapes(shapes);
    } catch {
      shapesLoading = null;
      setText("#state-inflate", config.views.offline);
      inflateEl.removeAttribute("aria-busy");
      return;
    }
    inflateEl.removeAttribute("aria-busy");
    setText("#state-inflate", "");
  }
  inflated = on;
  paintViews();
  // Labels learn their inflated homes before the morph starts, so they slide with the land.
  render();
  globe.setInflation(inflated);
});

function paintFlow() {
  flowEl.classList.toggle("on", flowing);
  flowEl.setAttribute("aria-pressed", String(flowing));
  setText("#state-flow", flowing ? flowState : "");
}

/** Today's discharge is fetched once, the first time the view is turned on; it is the page's only outside request. */
let dischargeAsked = false;
flowEl.addEventListener("click", async () => {
  cueTick();
  flowing = !flowing;
  if (flowing && !rivers) {
    flowEl.setAttribute("aria-busy", "true");
    flowState = config.views.loading;
    paintFlow();
    const ok = await needRivers();
    flowEl.removeAttribute("aria-busy");
    if (!ok) {
      flowing = false;
      flowState = "";
      paintFlow();
      setText("#state-flow", config.views.offline);
      return;
    }
  }
  if (flowing && rivers && !dischargeAsked) {
    dischargeAsked = true;
    // Live discharge loads behind the drawing; the rivers flow at a rank-based pace until it arrives.
    flowState = config.views.loading;
    // The cache is keyed by the river names too, so a renamed or added river is fetched rather than shown as no data.
    fetchDischarge(rivers.rivers, `${config.id}:flow:${nameHash(rivers.rivers)}`, (part) => {
      riverFlow.setFlows(part);
      flowState = config.views.live;
      paintFlow();
      render();
    })
      .then((flows) => {
        riverFlow.setFlows(flows);
        flowState = config.views.live;
      })
      .catch(() => (flowState = config.views.offline))
      .finally(() => {
        paintFlow();
        render();
      });
  }
  paintFlow();
  render();
});

filtersEl.addEventListener("toggle", capCard);
window.addEventListener("resize", () => {
  capCard();
  render();
});

// ---- Start ---------------------------------------------------------------------------------------------------------

/** Starts the app: paint the saved data at once if there is any, then fetch fresh data and keep it current. */
export function start() {
  const saved = readSaved(config.id);
  if (saved) {
    useData(saved);
    appEl.dataset.state = "ready";
    render();
  }
  void load({ quiet: !!saved });
  setInterval(() => {
    if (!document.hidden) void load({ quiet: true });
  }, config.refreshMinutes * 60_000);
}
