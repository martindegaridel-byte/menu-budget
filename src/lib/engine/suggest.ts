import type { Preferences } from "@/lib/domain/schemas";
import type { Cents } from "./money";
import { filterRecipes } from "./recipes";
import { buildShoppingList } from "./shopping";
import type { EngineContext } from "./types";

export interface PantrySuggestion {
  recipeId: string;
  name: string;
  cuisine: string;
  totalMinutes: number;
  /** Ingrédients choisis que la recette utilise. */
  uses: string[];
  /** Ce qu'il faut acheter en plus (paquets entiers, placard déduit). */
  extraCents: Cents;
  /** Ingrédients à acheter (hors placard). */
  missing: string[];
}

/**
 * « Que faire avec ce que j'ai ? » : recettes compatibles qui utilisent les ingrédients
 * choisis, les plus nombreux d'abord, puis les moins chères à compléter.
 */
export function suggestFromPantry(prefs: Preferences, ctx: EngineContext, ingredientIds: readonly string[], limit = 12): PantrySuggestion[] {
  const wanted = new Set(ingredientIds);
  const out: PantrySuggestion[] = [];
  for (const c of filterRecipes(prefs, ctx).candidates) {
    const uses = [...c.needs.keys()].filter((id) => wanted.has(id));
    if (uses.length === 0) continue;
    const list = buildShoppingList(c.needs, ctx);
    if (list.unavailable.length > 0) continue;
    out.push({
      recipeId: c.recipe.id,
      name: c.recipe.name,
      cuisine: c.recipe.cuisine,
      totalMinutes: c.recipe.prepMinutes + c.recipe.cookMinutes,
      uses,
      extraCents: list.totalCents,
      missing: list.lines.filter((l) => l.toBuy > 0 && !l.staple).map((l) => l.ingredientId),
    });
  }
  return out.sort((a, b) => b.uses.length - a.uses.length || a.extraCents - b.extraCents || a.totalMinutes - b.totalMinutes).slice(0, limit);
}
