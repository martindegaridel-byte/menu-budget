import type { Ingredient, Preferences, Recipe } from "@/lib/domain/schemas";

export interface RecipeGenerationRequest {
  preferences: Preferences;
  /** Ingrédients autorisés (déjà filtrés par régime, allergènes, exclusions, disponibilité). */
  allowedIngredients: readonly Ingredient[];
  /** Noms des recettes existantes, pour éviter les doublons. */
  existingRecipeNames: readonly string[];
  count: number;
}

export interface RecipeGenerationResult {
  recipes: Recipe[];
  rejected: { name: string; reason: string }[];
}

/**
 * Génère des recettes créatives. Le prix n'est JAMAIS fourni par le générateur :
 * le moteur le recalcule à partir de la base d'ingrédients.
 */
export interface RecipeGenerator {
  generate(request: RecipeGenerationRequest): Promise<RecipeGenerationResult>;
}
