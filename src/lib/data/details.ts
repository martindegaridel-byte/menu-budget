import { z } from "zod";
import detailsJson from "../../../data/recipe-details.json";
import type { BaseUnit } from "@/lib/domain/schemas";
import { formatQuantity } from "@/lib/engine/units";

/**
 * Instructions détaillées d'une recette (facultatives) : ustensiles, mise en place,
 * étapes précises (feu, durée, repères visuels) et astuces.
 * Dans les textes, « {id-ingredient} » est remplacé par la quantité pour le nombre de
 * personnes choisi (« 320 g », « 1,5 L », « 3 » pour les pièces).
 */
export const RecipeDetailSchema = z.object({
  utensils: z.array(z.string().min(2)).default([]),
  prep: z.array(z.string().min(3)).default([]),
  steps: z.array(z.object({ text: z.string().min(3), tip: z.string().min(3).optional() })).min(1),
  serve: z.string().min(3).optional(),
});
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;

const DETAILS = z.record(z.string(), RecipeDetailSchema).parse(detailsJson);

export function recipeDetail(recipeId: string): RecipeDetail | null {
  return DETAILS[recipeId] ?? null;
}

export function allRecipeDetails(): Readonly<Record<string, RecipeDetail>> {
  return DETAILS;
}

/**
 * Jetons dans les textes :
 * - « {riz} » : quantité de l'ingrédient (« 320 g », « 1,5 L », « 3 ») ;
 * - « {oeuf|œuf|œufs} » : nombre + nom accordé (« 1 œuf », « 3 œufs ») ;
 * - « {~1000 ml} » : quantité libre (eau…) proportionnelle au nombre de personnes.
 */
export const TOKEN = /\{([a-z0-9-]+)(?:\|([^|}]+)\|([^}]+))?\}/g;
const SCALED = /\{~(\d+(?:[.,]\d+)?)\s*(ml|g)\}/g;

const nf = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);

/** Quantité lisible dans une phrase : « 320 g », « 1,5 L », « 3 » (pièces), « 1 c. à soupe » (petits volumes). */
export function quantityInText(quantity: number, unit: BaseUnit): string {
  if (unit === "piece") return nf(Math.max(0.5, Math.round(quantity * 2) / 2));
  // Petits volumes (huile, vinaigre, sauce soja…) : en cuillères à soupe (15 ml), à la demie près.
  if (unit === "ml" && quantity <= 45) {
    const cs = Math.max(0.5, Math.round((quantity / 15) * 2) / 2);
    return `${cs === 0.5 ? "½" : nf(cs)} c. à soupe`;
  }
  return formatQuantity(quantity, unit);
}

/** Remplace les jetons ; un id inconnu est laissé tel quel (signalé par les tests). */
export function renderDetailText(
  text: string,
  quantities: ReadonlyMap<string, { quantity: number; unit: BaseUnit; gramsPerPiece?: number }>,
  factor = 1,
): string {
  return text
    .replace(SCALED, (_, n: string, unit: "ml" | "g") => formatQuantity(Number(n.replace(",", ".")) * factor, unit))
    .replace(TOKEN, (all, id: string, singular?: string, plural?: string) => {
      const q = quantities.get(id);
      if (!q) return all;
      if (!singular || !plural) return quantityInText(q.quantity, q.unit);
      // Forme « nombre + nom » : en pièces (poids moyen d'une pièce si l'ingrédient se compte en grammes).
      const pieces = q.unit === "piece" ? q.quantity : q.gramsPerPiece ? q.quantity / q.gramsPerPiece : null;
      if (pieces === null) return `${quantityInText(q.quantity, q.unit)} de ${plural}`;
      const n = Math.max(0.5, Math.round(pieces * 2) / 2);
      return `${nf(n)} ${n > 1 ? plural : singular}`;
    });
}
