import { describe, expect, it } from "vitest";
import { computeRecipeCost, filterRecipes } from "./recipes";
import { prefs, seedContext } from "./test-fixtures";

const ctx = seedContext();
const ids = (p: Parameters<typeof prefs>[0]) => filterRecipes(prefs(p), ctx).candidates.map((c) => c.recipe.id);

describe("filterRecipes (contraintes dures)", () => {
  it("exclut les recettes contenant un allergène", () => {
    const res = filterRecipes(prefs({ allergens: ["gluten"] }), ctx);
    for (const c of res.candidates) {
      for (const id of c.needs.keys()) expect(ctx.ingredients.get(id)!.allergens).not.toContain("gluten");
    }
    expect(ids({ allergens: ["gluten"] })).not.toContain("spaghetti-carbonara");
  });

  it("respecte le régime vegan", () => {
    const res = filterRecipes(prefs({ diet: "vegan" }), ctx);
    expect(res.candidates.length).toBeGreaterThan(5);
    for (const c of res.candidates) for (const id of c.needs.keys()) expect(ctx.ingredients.get(id)!.animal).toBeNull();
  });

  it("exclut un aliment détesté", () => {
    expect(ids({ excludedIngredientIds: ["champignon-paris"] })).not.toContain("risotto-champignons");
  });

  it("retire un ingrédient facultatif incompatible au lieu d'écarter la recette", () => {
    const res = filterRecipes(prefs({ allergens: ["lait"] }), ctx);
    const penne = res.candidates.find((c) => c.recipe.id === "pates-legumes-soleil");
    expect(penne).toBeDefined();
    const omelette = filterRecipes(prefs({ excludedIngredientIds: ["ciboulette"] }), ctx).candidates.find(
      (c) => c.recipe.id === "omelette-champignons",
    );
    expect(omelette?.droppedOptional).toContain("ciboulette");
    expect(omelette?.needs.has("ciboulette")).toBe(false);
  });

  it("respecte temps, niveau et équipement", () => {
    const res = filterRecipes(prefs({ maxTotalMinutes: 20, maxDifficulty: 1, equipment: ["plaques"] }), ctx);
    for (const c of res.candidates) {
      expect(c.recipe.prepMinutes + c.recipe.cookMinutes).toBeLessThanOrEqual(20);
      expect(c.recipe.difficulty).toBe(1);
      expect(c.recipe.equipment).toEqual(["plaques"]);
    }
  });

  it("écarte une recette dont un ingrédient est indisponible, sauf s'il est au placard", () => {
    const off = seedContext({ unavailable: ["lait-coco"] });
    expect(filterRecipes(prefs(), off).candidates.map((c) => c.recipe.id)).not.toContain("poulet-curry-coco");
    const inPantry = seedContext({ unavailable: ["lait-coco"], pantry: [{ ingredientId: "lait-coco", quantity: 400 }] });
    expect(filterRecipes(prefs(), inPantry).candidates.map((c) => c.recipe.id)).toContain("poulet-curry-coco");
  });
});

describe("computeRecipeCost", () => {
  it("met à l'échelle selon le nombre de personnes et compte les paquets entiers", () => {
    const recipe = ctx.recipes.find((r) => r.id === "spaghetti-carbonara")!;
    const two = computeRecipeCost(recipe, prefs({ persons: 2 }), ctx)!;
    const eight = computeRecipeCost(recipe, prefs({ persons: 8 }), ctx)!;
    expect(two.purchaseCents).toBeGreaterThan(0);
    expect(eight.purchaseCents).toBeGreaterThan(two.purchaseCents);
    expect(two.usedCents).toBeLessThanOrEqual(two.purchaseCents);
  });
});

describe("remplacer un ingrédient dans un plat", () => {
  const ctx2 = seedContext();
  const base = prefs({ persons: 2, maxTotalMinutes: 300 });
  const find = (p: typeof base, id: string) => filterRecipes(p, ctx2).candidates.find((c) => c.recipe.id === id)!;

  it("remplace l'ingrédient en gardant la quantité (même unité)", () => {
    const before = find(base, "veloute-poireaux");
    const after = find({ ...base, substitutions: [{ recipeId: "veloute-poireaux", from: "poireau", to: "courgette" }] }, "veloute-poireaux");
    expect(before.needs.has("poireau")).toBe(true);
    expect(after.needs.has("poireau")).toBe(false);
    expect(after.needs.get("courgette")).toBeCloseTo(before.needs.get("poireau")!);
    expect(after.substituted).toEqual([{ from: "poireau", to: "courgette" }]);
  });

  it("ignore un remplacement impossible (autre unité ou aliment exclu)", () => {
    const otherUnit = find({ ...base, substitutions: [{ recipeId: "veloute-poireaux", from: "poireau", to: "oeuf" }] }, "veloute-poireaux");
    expect(otherUnit.needs.has("poireau")).toBe(true);
    const excluded = find({ ...base, excludedIngredientIds: ["courgette"], substitutions: [{ recipeId: "veloute-poireaux", from: "poireau", to: "courgette" }] }, "veloute-poireaux");
    expect(excluded.needs.has("poireau")).toBe(true);
    expect(excluded.substituted).toEqual([]);
  });
});
