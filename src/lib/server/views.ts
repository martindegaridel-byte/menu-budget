import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { deriveRecipeFacts, derivedTags } from "@/lib/engine/facts";
import { PreferencesSchema } from "@/lib/domain/schemas";
import { filterRecipes } from "@/lib/engine/recipes";
import { buildShoppingList } from "@/lib/engine/shopping";
import { buildEngineContext, getCatalog } from "./catalog";
import { prisma } from "./db";

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

export interface RecipeBrowseItem extends RecipeSummary {
  /** Prix de la part utilisée pour 1 portion (indicatif, magasin de référence). */
  portionCents: number | null;
  kcal: number | null;
  protein: number | null;
  stars: number | null;
  favorite: boolean;
  /** Noms des ingrédients (recherche). */
  ingredientNames: string[];
}

/** Données de la page « Recettes » : toutes les recettes avec prix par portion, macros, notes et favoris. */
export async function getRecipeBrowseData(userId: string): Promise<RecipeBrowseItem[]> {
  const prefs = PreferencesSchema.parse({ budgetCents: 0, meals: 1, persons: 1, usePantry: false, maxTotalMinutes: 300 });
  const [{ recipes }, ctx, favs, ratings] = await Promise.all([
    getCatalogView(),
    buildEngineContext(userId, prefs),
    prisma.favoriteRecipe.findMany({ where: { userId }, select: { recipeId: true } }),
    prisma.recipeRating.findMany({ where: { userId }, select: { recipeId: true, stars: true } }),
  ]);
  const prepared = new Map(filterRecipes(prefs, ctx).candidates.map((c) => [c.recipe.id, c]));
  const favSet = new Set(favs.map((f) => f.recipeId));
  const starsById = new Map(ratings.map((r) => [r.recipeId, r.stars]));
  return recipes.map((r) => {
    const c = prepared.get(r.id);
    const list = c ? buildShoppingList(c.needs, ctx) : null;
    return {
      ...r,
      portionCents: list && list.unavailable.length === 0 ? list.usedCostCents : null,
      kcal: c?.nutrition?.kcal ?? null,
      protein: c?.nutrition?.protein ?? null,
      stars: starsById.get(r.id) ?? null,
      favorite: favSet.has(r.id),
      ingredientNames: r.ingredientIds.map((id) => ctx.ingredients.get(id)?.name ?? id),
    };
  });
}
