import { describe, expect, it } from "vitest";
import type { PrepPlan } from "@/lib/engine/optimize";
import type { PlannedEvening } from "./planning";
import { dayStatuses, nextWeekday, sessionDishes } from "./weekPlan";

const ev = (day: number, slot: number, recipeId: string): PlannedEvening => ({ date: `2026-11-${String(15 + day).padStart(2, "0")}`, day, slot, recipeId, name: recipeId.toUpperCase() });
const plan = (over: Partial<PrepPlan> = {}): PrepPlan => ({ cookOnce: [], sharedBases: [], sessionMinutes: 120, freezeSlots: [], freshSlots: [], ...over });

describe("dayStatuses", () => {
  const evenings = [ev(0, 0, "a"), ev(1, 1, "b"), ev(2, 2, "c"), ev(3, 3, "d")];
  const keep = (id: string) => ({ a: 3, b: 3, c: 3, d: 2 })[id];

  it("sans batch, tout est cuisiné le soir même", () => {
    expect(dayStatuses(evenings, null, keep).every((s) => s.kind === "frais" && !s.late)).toBe(true);
  });

  it("avec batch : session le jour 0, puis plats réchauffés", () => {
    const s = dayStatuses(evenings, plan(), keep);
    expect(s.map((x) => x.kind)).toEqual(["session", "reheat", "reheat", "reheat"]);
    expect(s.map((x) => x.daysAfter)).toEqual([0, 1, 2, 3]);
  });

  it("congélateur et plats frais d'après le plan du moteur", () => {
    const s = dayStatuses(evenings, plan({ freezeSlots: [3], freshSlots: [2] }), keep);
    expect(s.map((x) => x.kind)).toEqual(["session", "reheat", "frais", "congel"]);
  });

  it("signale un plat déplacé au-delà de sa conservation (sauf congelé)", () => {
    const s = dayStatuses(evenings, plan(), keep);
    expect(s[3]!.late).toBe(true); // d se garde 2 jours, mangé 3 jours après
    expect(s[1]!.late).toBe(false);
    expect(dayStatuses(evenings, plan({ freezeSlots: [3] }), keep)[3]!.late).toBe(false);
  });

  it("suit la place réelle du plat dans le planning, pas son rang d'origine", () => {
    // Le plat d (rang 3) est avancé au jour 1 : réchauffé 1 jour après, pas en retard.
    const moved = [ev(0, 0, "a"), ev(1, 3, "d"), ev(2, 1, "b"), ev(3, 2, "c")];
    const s = dayStatuses(moved, plan(), keep);
    expect(s[1]).toEqual({ kind: "reheat", daysAfter: 1, late: false });
  });

  it("applique 1 jour de conservation quand elle est inconnue", () => {
    const s = dayStatuses([ev(0, 0, "x"), ev(2, 1, "x")], plan(), () => undefined);
    expect(s[1]!.late).toBe(true);
  });
});

describe("sessionDishes", () => {
  it("regroupe par plat les soirs servis depuis la session, sans les plats frais", () => {
    const evenings = [ev(0, 0, "a"), ev(1, 1, "a"), ev(2, 2, "b"), ev(3, 3, "c")];
    const statuses = dayStatuses(evenings, plan({ freshSlots: [3] }), () => 5);
    const dishes = sessionDishes(evenings, statuses);
    expect(dishes.map((d) => [d.recipeId, d.days])).toEqual([["a", [0, 1]], ["b", [2]]]);
  });
});

describe("nextWeekday", () => {
  it("renvoie la date elle-même si elle tombe le bon jour, sinon la suivante", () => {
    expect(nextWeekday("2026-11-15", 0)).toBe("2026-11-15"); // dimanche
    expect(nextWeekday("2026-11-13", 0)).toBe("2026-11-15"); // vendredi → dimanche
    expect(nextWeekday("2026-11-16", 0)).toBe("2026-11-22"); // lundi → dimanche suivant
  });
});
