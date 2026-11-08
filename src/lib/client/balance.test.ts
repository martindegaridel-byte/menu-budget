import { describe, expect, it } from "vitest";
import { weekBalance } from "./balance";

describe("équilibre de la semaine", () => {
  it("compte poisson, légumineuses, viande rouge et légumes", () => {
    const b = weekBalance([
      { protein: "poisson", vegGrams: 160 },
      { protein: "legumineuses", vegGrams: 120 },
      { protein: "boeuf", vegGrams: 80 },
      { protein: null, vegGrams: 200 },
    ]);
    expect(b).toMatchObject({ meals: 4, fish: 1, legumes: 1, redMeat: 1, vegetarian: 2 });
    expect(b.vegPortionsPerMeal).toBe(1.8);
    expect(b.tips.every((t) => t.tone === "good")).toBe(true);
  });

  it("signale le manque de poisson et l'excès de viande rouge", () => {
    const b = weekBalance(Array.from({ length: 7 }, () => ({ protein: "boeuf", vegGrams: 40 })));
    const warns = b.tips.filter((t) => t.tone === "warn").map((t) => t.text);
    expect(warns.some((t) => t.includes("poisson"))).toBe(true);
    expect(warns.some((t) => t.includes("viande rouge"))).toBe(true);
    expect(warns.some((t) => t.includes("légumes"))).toBe(true);
  });

  it("menu vide : aucun conseil", () => {
    expect(weekBalance([]).tips).toEqual([]);
  });
});
