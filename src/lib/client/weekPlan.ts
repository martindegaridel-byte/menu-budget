import type { PrepPlan } from "@/lib/engine/optimize";
import { addDays, type PlannedEvening } from "./planning";

/**
 * Planning de la semaine avec batch cooking : pour chaque soir, le plat est-il cuisiné le soir même,
 * pendant la session (jour 0), réchauffé ou sorti du congélateur ? Pur et testable.
 */
export type DayKind = "frais" | "session" | "reheat" | "congel";

export interface DayStatus {
  kind: DayKind;
  /** Jours écoulés depuis la session (0 = le jour de la session). */
  daysAfter: number;
  /** Plat placé plus loin que sa durée de conservation au frigo (et pas congelé). */
  late: boolean;
}

/** Durée de conservation supposée sans information (comme le moteur). */
export const DEFAULT_FRIDGE_DAYS = 1;

export function dayStatuses(
  evenings: readonly Pick<PlannedEvening, "day" | "slot" | "recipeId">[],
  plan: PrepPlan | null,
  fridgeDaysOf: (recipeId: string) => number | undefined,
): DayStatus[] {
  return evenings.map((e) => {
    if (!plan) return { kind: "frais", daysAfter: 0, late: false };
    if (e.day === 0) return { kind: "session", daysAfter: 0, late: false };
    if (plan.freshSlots.includes(e.slot)) return { kind: "frais", daysAfter: 0, late: false };
    if (plan.freezeSlots.includes(e.slot)) return { kind: "congel", daysAfter: e.day, late: false };
    const keep = fridgeDaysOf(e.recipeId) ?? DEFAULT_FRIDGE_DAYS;
    return { kind: "reheat", daysAfter: e.day, late: e.day > keep };
  });
}

export interface SessionDish {
  recipeId: string;
  name: string;
  /** Soirs (jours du planning, 0 = session) où ce plat est mangé. */
  days: number[];
  dates: string[];
}

/** Plats cuisinés pendant la session, avec les soirs où ils sont mangés (ordre du planning). */
export function sessionDishes(evenings: readonly PlannedEvening[], statuses: readonly DayStatus[]): SessionDish[] {
  const out = new Map<string, SessionDish>();
  evenings.forEach((e, i) => {
    if (statuses[i]!.kind === "frais") return;
    const cur = out.get(e.recipeId) ?? { recipeId: e.recipeId, name: e.name, days: [], dates: [] };
    cur.days.push(e.day);
    cur.dates.push(e.date);
    out.set(e.recipeId, cur);
  });
  return [...out.values()];
}

/** Prochaine date tombant un jour de semaine donné (0 = dimanche), à partir de `from` (inclus). */
export function nextWeekday(from: string, weekday: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return addDays(from, (weekday - dow + 7) % 7);
}
