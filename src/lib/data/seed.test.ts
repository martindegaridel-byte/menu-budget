import { describe, expect, it } from "vitest";
import { toBaseQuantity } from "@/lib/engine/units";
import { compatibleDiets } from "@/lib/engine/diet";
import { DERIVED_TAG_NAMES } from "@/lib/engine/facts";
import { RecipeSchema } from "@/lib/domain/schemas";
import { loadSeedData } from "./seed";

const data = loadSeedData();
const byId = new Map(data.ingredients.map((i) => [i.id, i]));

describe("données seed", () => {
  it("contient au moins 150 ingrédients et 40 recettes", () => {
    expect(data.ingredients.length).toBeGreaterThanOrEqual(150);
    expect(data.recipes.length).toBeGreaterThanOrEqual(40);
  });

  it("a des identifiants uniques", () => {
    expect(new Set(data.ingredients.map((i) => i.id)).size).toBe(data.ingredients.length);
    expect(new Set(data.recipes.map((r) => r.id)).size).toBe(data.recipes.length);
  });

  it("donne au moins un conditionnement à chaque ingrédient", () => {
    const withPkg = new Set(data.packages.map((p) => p.ingredientId));
    for (const i of data.ingredients) expect(withPkg.has(i.id), i.id).toBe(true);
  });

  it("référence uniquement des ingrédients existants, avec des unités convertibles", () => {
    for (const r of data.recipes) {
      for (const line of r.ingredients) {
        const ing = byId.get(line.ingredientId);
        expect(ing, `${r.id} → ${line.ingredientId}`).toBeDefined();
        expect(() => toBaseQuantity(line.quantity, line.unit, ing!), `${r.id} → ${line.ingredientId}`).not.toThrow();
      }
    }
  });

  it("propose des recettes pour chaque régime", () => {
    const count = (diet: string) =>
      data.recipes.filter((r) =>
        compatibleDiets(r.ingredients.filter((l) => !l.optional).map((l) => byId.get(l.ingredientId)!.animal)).includes(
          diet as never,
        ),
      ).length;
    expect(count("vegan")).toBeGreaterThanOrEqual(10);
    expect(count("vegetarien")).toBeGreaterThanOrEqual(20);
  });

  it("propose des recettes sans gluten et sans lactose", () => {
    const without = (allergen: string) =>
      data.recipes.filter((r) =>
        r.ingredients.every((l) => l.optional || !byId.get(l.ingredientId)!.allergens.includes(allergen as never)),
      ).length;
    expect(without("gluten")).toBeGreaterThanOrEqual(15);
    expect(without("lait")).toBeGreaterThanOrEqual(15);
  });

  describe.each(data.recipes.map((r) => [r.id, r] as const))("recette %s", (_, r) => {
    it("est valide (schéma Zod, temps et étapes cohérents)", () => {
      expect(RecipeSchema.safeParse(r).success).toBe(true);
      const total = r.prepMinutes + r.cookMinutes;
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(300);
      expect(r.steps.length).toBeGreaterThanOrEqual(2);
      expect(r.ingredients.filter((l) => !l.optional).length).toBeGreaterThanOrEqual(2);
    });

    it("n'utilise que des ingrédients existants, une seule fois chacun", () => {
      for (const l of r.ingredients) expect(byId.has(l.ingredientId), l.ingredientId).toBe(true);
      const ids = r.ingredients.map((l) => l.ingredientId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("ne porte aucune étiquette de régime, d'allergène, de protéine ou de durée écrite à la main", () => {
      for (const t of r.tags) expect(DERIVED_TAG_NAMES.has(t), t).toBe(false);
    });

    it("déclare le four si une étape l'utilise", () => {
      const usesOven = r.steps.some((s) => /\b(four|enfourner|gratiner)\b/i.test(s));
      if (usesOven) expect(r.equipment).toContain("four");
    });
  });
});
