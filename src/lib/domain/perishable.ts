import type { Aisle, Ingredient } from "./schemas";

/** Rayons de produits frais : une date de péremption y a du sens. */
const FRESH_AISLES: ReadonlySet<Aisle> = new Set(["fruits-legumes", "boucherie", "charcuterie", "poissonnerie", "cremerie", "vegetal", "boulangerie"]);

/** Produits de ces rayons qui se conservent longtemps malgré tout. */
const LONG_LIFE = new Set(["proteines-soja"]);

/**
 * Faut-il proposer une date de péremption pour cet ingrédient ?
 * Non pour l'épicerie sèche (pâtes, riz…), les conserves, les épices et les surgelés.
 */
export function isPerishable(ing: Pick<Ingredient, "id" | "aisle">): boolean {
  return FRESH_AISLES.has(ing.aisle) && !LONG_LIFE.has(ing.id);
}
