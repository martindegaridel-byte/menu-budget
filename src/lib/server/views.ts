import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { deriveRecipeFacts, derivedTags } from "@/lib/engine/facts";
import { getCatalog } from "./catalog";

/** Données de catalogue allégées pour les composants client. */
export async function getCatalogView(): Promise<{ ingredients: IngredientOption[]; recipes: RecipeSummary[] }> {
  const c = await getCatalog();
  const byId = new Map(c.ingredients.map((i) => [i.id, i]));
  return {
    ingredients: c.ingredients.map(({ id, name, aisle, unit, staple, tags, animal }) => ({ id, name, aisle, unit, staple, tags, animal })),
    recipes: c.recipes.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      cuisine: r.cuisine,
      totalMinutes: r.prepMinutes + r.cookMinutes,
      ingredientIds: [...new Set(r.ingredients.map((l) => l.ingredientId))].filter((id) => !byId.get(id)?.staple),
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      portions: r.portions,
      fridgeDays: r.fridgeDays,
      freezable: r.freezable,
      reheats: r.reheats,
      difficulty: r.difficulty,
      // Étiquettes de la recette + celles déduites des ingrédients (régime, « rapide »…).
      tags: [...new Set([...r.tags, ...derivedTags(deriveRecipeFacts(r, byId))])],
    })),
  };
}
