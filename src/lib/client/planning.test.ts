import { describe, expect, it } from "vitest";
import { addDays, buildIcs, move, plannedEvenings, planningFor } from "./planning";

const recipes = [
  { recipeId: "chili", name: "Chili, végétarien" },
  { recipeId: "dal", name: "Dal" },
  { recipeId: "pates", name: "Pâtes" },
];

describe("planning de la semaine", () => {
  it("repart de zéro si le menu a changé, garde l'ordre sinon", () => {
    const fresh = planningFor(null, "m1", 3, "2026-11-09");
    expect(fresh).toEqual({ key: "m1", start: "2026-11-09", order: [0, 1, 2] });
    const kept = planningFor({ key: "m1", start: "2026-11-10", order: [2, 0, 1] }, "m1", 3, "2026-11-09");
    expect(kept.order).toEqual([2, 0, 1]);
    expect(planningFor({ key: "m0", start: "2026-11-10", order: [2, 0, 1] }, "m1", 3, "2026-11-09").order).toEqual([0, 1, 2]);
  });

  it("associe un plat à chaque soir, y compris en changeant de mois", () => {
    const e = plannedEvenings({ key: "m1", start: "2026-11-29", order: [2, 0, 1] }, recipes);
    expect(e.map((x) => [x.date, x.recipeId])).toEqual([
      ["2026-11-29", "pates"],
      ["2026-11-30", "chili"],
      ["2026-12-01", "dal"],
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("déplace un plat (glisser-déposer)", () => {
    expect(move([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3]);
    expect(move([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2]);
  });

  it("produit un fichier calendrier valide (19 h – 20 h, texte échappé)", () => {
    const ics = buildIcs(plannedEvenings({ key: "m1", start: "2026-11-09", order: [0, 1, 2] }, recipes), { origin: "https://app.test", persons: 2, now: new Date("2026-11-08T10:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("DTSTART:20261109T190000");
    expect(ics).toContain("SUMMARY:Dîner : Chili\\, végétarien");
    expect(ics).toContain("URL:https://app.test/recettes/chili?p=2");
  });
});
