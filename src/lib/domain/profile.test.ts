import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { optimizeMenu } from "@/lib/engine/optimize";
import { prefs, seedContext } from "@/lib/engine/test-fixtures";
import { applyProfile, EXCLUSION_GROUPS, groupIngredientIds } from "./profile";

const { ingredients } = loadSeedData();

describe("exclusions permanentes", () => {
  it("fusionne profil et choix du menu sans doublon", () => {
    const p = applyProfile(prefs({ excludedIngredientIds: ["tomate"], allergens: ["lait"] }), {
      excludedIngredientIds: ["tomate", "champignon-paris"],
      allergens: ["gluten"],
    });
    expect(p.excludedIngredientIds.sort()).toEqual(["champignon-paris", "tomate"]);
    expect(p.allergens.sort()).toEqual(["gluten", "lait"]);
  });

  it("chaque famille principale contient des ingrédients", () => {
    for (const g of ["porc", "boeuf", "volaille", "poisson", "champignon", "fromage", "piquant"]) {
      expect(groupIngredientIds(g, ingredients).length, g).toBeGreaterThan(0);
    }
    expect(EXCLUSION_GROUPS.length).toBeGreaterThanOrEqual(8);
  });

  it("un menu n'utilise jamais un aliment exclu en permanence (ex. tout le porc)", () => {
    const porc = groupIngredientIds("porc", ingredients);
    const p = applyProfile(prefs({ budgetCents: 5000, meals: 7, persons: 2 }), { excludedIngredientIds: porc, allergens: [] });
    const res = optimizeMenu(p, seedContext());
    expect(res.status).toBe("ok");
    for (const l of res.shoppingList.lines) expect(porc).not.toContain(l.ingredientId);
  });
});
