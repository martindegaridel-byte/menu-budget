import type { Ingredient, RecipeUnit } from "@/lib/domain/schemas";

/** Approximations documentées : 1 cuillère à soupe = 15 g/ml, 1 cuillère à café = 5 g/ml, densité 1 entre g et ml. */
export const TABLESPOON = 15;
export const TEASPOON = 5;

export class UnitConversionError extends Error {}

/**
 * Convertit une quantité de recette dans l'unité de base de l'ingrédient.
 * Lève `UnitConversionError` si la conversion n'a pas de sens (ex. « 2 pièces » de lait).
 */
export function toBaseQuantity(quantity: number, unit: RecipeUnit, ingredient: Ingredient): number {
  const fail = (): never => {
    throw new UnitConversionError(`Impossible de convertir ${quantity} ${unit} de « ${ingredient.name} » en ${ingredient.unit}`);
  };
  switch (ingredient.unit) {
    case "piece":
      return unit === "piece" ? quantity : fail();
    case "g":
    case "ml":
      switch (unit) {
        case "g":
        case "ml":
          return quantity;
        case "kg":
        case "l":
          return quantity * 1000;
        case "cl":
          return quantity * 10;
        case "cs":
          return quantity * TABLESPOON;
        case "cc":
          return quantity * TEASPOON;
        case "piece":
          return ingredient.unit === "g" && ingredient.gramsPerPiece ? quantity * ingredient.gramsPerPiece : fail();
      }
  }
  return fail();
}

/** Affiche une quantité en unité de base de manière lisible (« 1,2 kg », « 250 g », « 3 pièces »). */
export function formatQuantity(quantity: number, unit: Ingredient["unit"]): string {
  const nf = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
  if (unit === "piece") {
    const q = Math.round(quantity * 10) / 10;
    return `${nf(q)} ${q > 1 ? "pièces" : "pièce"}`;
  }
  const big = unit === "g" ? "kg" : "L";
  if (quantity >= 1000) return `${nf(quantity / 1000)} ${big}`;
  return `${nf(Math.round(quantity))} ${unit === "g" ? "g" : "ml"}`;
}
