import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { prefs } from "@/lib/engine/test-fixtures";
import { validateGeneratedRecipes, type RawGeneratedRecipe } from "./validate";

const { ingredients, recipes } = loadSeedData();
const base: RawGeneratedRecipe = {
  name: "Poêlée de lentilles aux carottes",
  description: "Simple et économique.",
  cuisine: "francaise",
  baseServings: 2,
  prepMinutes: 10,
  cookMinutes: 25,
  difficulty: 1,
  equipment: ["plaques"],
  ingredients: [
    { ingredientId: "lentilles-vertes", quantity: 150, unit: "g", optional: false },
    { ingredientId: "carotte", quantity: 2, unit: "piece", optional: false },
  ],
  steps: ["Cuire les lentilles.", "Ajouter les carottes."],
};
const req = (p = prefs({ diet: "vegan" })) => ({
  preferences: p,
  allowedIngredients: ingredients,
  existingRecipeNames: recipes.map((r) => r.name),
  count: 1,
});

describe("validateGeneratedRecipes (sortie LLM)", () => {
  it("accepte une recette conforme et lui donne un identifiant", () => {
    const res = validateGeneratedRecipes([base], req());
    expect(res.rejected).toEqual([]);
    expect(res.recipes[0]).toMatchObject({ id: "ia-poelee-de-lentilles-aux-carottes", source: "llm" });
  });

  it("rejette un ingrédient inventé (le prix ne peut pas être deviné)", () => {
    const bad = { ...base, ingredients: [{ ingredientId: "truffe-noire", quantity: 10, unit: "g", optional: false }] };
    expect(validateGeneratedRecipes([bad], req()).rejected[0]!.reason).toMatch(/inconnu/);
  });

  it("rejette un ingrédient interdit par le régime", () => {
    const bad = { ...base, ingredients: [...base.ingredients, { ingredientId: "lardons-fumes", quantity: 100, unit: "g", optional: false }] };
    expect(validateGeneratedRecipes([bad], req()).rejected[0]!.reason).toMatch(/interdit/);
  });

  it("rejette une unité absurde, un doublon et une recette trop longue", () => {
    const unit = { ...base, name: "Recette lait", ingredients: [{ ingredientId: "lait-demi-ecreme", quantity: 2, unit: "piece", optional: false }] };
    const dup = { ...base, name: "Dal de lentilles corail" };
    const long = { ...base, name: "Recette longue", cookMinutes: 200 };
    const res = validateGeneratedRecipes([unit, dup, long], req());
    expect(res.recipes).toHaveLength(0);
    expect(res.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/unité/), "existe déjà", "trop long"]);
  });
});
