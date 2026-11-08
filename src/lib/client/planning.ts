/** Planning de la semaine : un plat par soir, à partir d'une date ; export calendrier (.ics). */

export interface Planning {
  /** Menu auquel se rapporte le planning (si le menu change, le planning repart de zéro). */
  key: string;
  /** Date du premier repas (AAAA-MM-JJ). */
  start: string;
  /** Ordre des plats : order[jour] = position du plat dans le menu. */
  order: number[];
}

export interface PlannedEvening {
  date: string;
  day: number;
  slot: number;
  recipeId: string;
  name: string;
}

export const PLANNING_KEY = "mb:planning";

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** Planning valide pour ce menu (sinon : à partir d'aujourd'hui, dans l'ordre du menu). */
export function planningFor(stored: Planning | null, key: string, count: number, today: string): Planning {
  const valid = stored && stored.key === key && stored.order.length === count && [...stored.order].sort((a, b) => a - b).every((v, i) => v === i);
  return valid ? stored! : { key, start: today, order: Array.from({ length: count }, (_, i) => i) };
}

export function plannedEvenings(planning: Planning, recipes: readonly { recipeId: string; name: string }[]): PlannedEvening[] {
  return planning.order.flatMap((slot, day) => {
    const r = recipes[slot];
    return r ? [{ date: addDays(planning.start, day), day, slot, recipeId: r.recipeId, name: r.name }] : [];
  });
}

/** Déplace l'élément de `from` à `to` (glisser-déposer). */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!);
  return next;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (iso: string) => iso.replace(/-/g, "");

/** Fichier calendrier : un événement par soir (19 h – 20 h, heure locale). */
export function buildIcs(evenings: readonly PlannedEvening[], opts: { origin: string; persons: number; now?: Date }): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Menu Budget//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of evenings) {
    const url = `${opts.origin}/recettes/${e.recipeId}?p=${opts.persons}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${compact(e.date)}-${e.recipeId}@menu-budget`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compact(e.date)}T190000`,
      `DTEND:${compact(e.date)}T200000`,
      `SUMMARY:${icsText(`Dîner : ${e.name}`)}`,
      `DESCRIPTION:${icsText(`Recette : ${url}`)}`,
      `URL:${url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
