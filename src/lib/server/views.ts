import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { getCatalog } from "./catalog";

/** Données de catalogue allégées pour les composants client. */
export async function getCatalogView(): Promise<{ ingredients: IngredientOption[]; recipes: RecipeSummary[] }> {
  const c = await getCatalog();
  return {
    ingredients: c.ingredients.map(({ id, name, aisle, unit, staple }) => ({ id, name, aisle, unit, staple })),
    recipes: c.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      cuisine: r.cuisine,
      totalMinutes: r.prepMinutes + r.cookMinutes,
      difficulty: r.difficulty,
      tags: r.tags,
    })),
  };
}
