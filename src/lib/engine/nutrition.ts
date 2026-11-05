import type { Ingredient, Nutrition, NutritionGoal } from "@/lib/domain/schemas";
import type { Needs } from "./types";

/**
 * Valeurs nutritionnelles d'un ensemble de besoins (unités de base), ramenées à une
 * portion. null si un ingrédient significatif n'a pas de données.
 */
export function nutritionPerPortion(needs: Needs, ingredients: ReadonlyMap<string, Ingredient>, portions: number): Nutrition | null {
  const sum: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const [id, q] of needs) {
    const ing = ingredients.get(id);
    if (!ing) continue;
    if (!ing.nutrition) {
      if (ing.staple) continue; // épices, condiments : négligeables
      return null;
    }
    const f = ing.unit === "piece" ? q : q / 100;
    sum.kcal += ing.nutrition.kcal * f;
    sum.protein += ing.nutrition.protein * f;
    sum.carbs += ing.nutrition.carbs * f;
    sum.fat += ing.nutrition.fat * f;
  }
  const p = Math.max(1, portions);
  return { kcal: Math.round(sum.kcal / p), protein: Math.round(sum.protein / p), carbs: Math.round(sum.carbs / p), fat: Math.round(sum.fat / p) };
}

/** Repères : « riche en protéines » ≥ 30 g par portion ; « équilibré » ≈ 15 % protéines, 50 % glucides, 35 % lipides. */
export const HIGH_PROTEIN_GRAMS = 30;
export const BALANCED_TARGET = { protein: 0.15, carbs: 0.5, fat: 0.35 } as const;

/** Parts de l'énergie apportées par chaque macronutriment. */
export function energyShares(n: Nutrition) {
  const e = 4 * n.protein + 4 * n.carbs + 9 * n.fat;
  if (e <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: (4 * n.protein) / e, carbs: (4 * n.carbs) / e, fat: (9 * n.fat) / e };
}

/** Bonus de score selon l'objectif (plus haut = mieux adapté). */
export function nutritionBonus(n: Nutrition | null, goal: NutritionGoal): number {
  if (goal === "aucun" || !n) return 0;
  if (goal === "proteine") {
    if (n.protein >= HIGH_PROTEIN_GRAMS + 5) return 9;
    if (n.protein >= HIGH_PROTEIN_GRAMS) return 7;
    if (n.protein >= 22) return 3;
    if (n.protein < 12) return -5;
    return -1;
  }
  const s = energyShares(n);
  const dist = Math.abs(s.protein - BALANCED_TARGET.protein) + Math.abs(s.carbs - BALANCED_TARGET.carbs) + Math.abs(s.fat - BALANCED_TARGET.fat);
  let bonus = Math.max(-5, Math.min(7, 7 - dist * 25));
  if (n.kcal < 350 || n.kcal > 1000) bonus -= 2; // repas trop léger ou trop copieux
  return bonus;
}
