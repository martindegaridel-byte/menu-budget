import type { Recipe } from "@/lib/domain/schemas";
import { recipeDetail, renderDetailText } from "@/lib/data/details";
import { toBaseQuantity } from "@/lib/engine/units";
import type { getCatalog } from "./catalog";

type Catalog = Awaited<ReturnType<typeof getCatalog>>;

/** Étapes d'une recette pour `persons` : version détaillée (quantités dans le texte) si elle existe, sinon la version simple. */
export function recipeStepsFor(recipe: Recipe, persons: number, catalog: Catalog): { prep: string[]; steps: string[] } {
  const factor = persons / recipe.baseServings;
  const detail = recipeDetail(recipe.id);
  if (!detail) return { prep: [], steps: recipe.steps };
  const quantities = new Map(
    recipe.ingredients.flatMap((l) => {
      const ing = catalog.ingredientsById.get(l.ingredientId);
      return ing ? [[l.ingredientId, { quantity: toBaseQuantity(l.quantity, l.unit, ing) * factor, unit: ing.unit, gramsPerPiece: ing.gramsPerPiece }] as const] : [];
    }),
  );
  const render = (t: string) => renderDetailText(t, quantities, factor);
  return {
    prep: detail.prep.map(render),
    steps: detail.steps.map((s) => (s.tip ? `${render(s.text)}\n\nAstuce : ${render(s.tip)}` : render(s.text))),
  };
}
