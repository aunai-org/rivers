/** What is selected on the globe: a river (by its line's name), a country (by the table's name), or both. */
export type Selection = { river?: string | null; country?: string | null };

/**
 * Which rivers to draw for a selection, as indices into `rivers`; null means all of them.
 * A river wins over a country, so picking one of a country's rivers narrows to that river.
 */
export function riversShown(rivers: { name: string; countries: string[] }[], sel: Selection): Set<number> | null {
  if (sel.river) return new Set(rivers.flatMap((r, i) => (r.name === sel.river ? [i] : [])));
  if (sel.country) return new Set(rivers.flatMap((r, i) => (r.countries.includes(sel.country!) ? [i] : [])));
  return null;
}
