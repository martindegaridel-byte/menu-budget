import type { Aisle, BaseUnit } from "@/lib/domain/schemas";

/** Données de catalogue légères passées des composants serveur aux composants client. */
export interface IngredientOption {
  id: string;
  name: string;
  aisle: Aisle;
  unit: BaseUnit;
  staple: boolean;
  /** Familles (base:riz, porc, fromage…) : pour proposer des remplaçants proches. */
  tags?: string[];
  animal?: string | null;
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  totalMinutes: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: number;
  tags: string[];
  /** Ingrédients de la recette hors condiments (pour « Remplacer un ingrédient »). */
  ingredientIds: string[];
  /** Conservation (facultatif) : utile au batch cooking. */
  portions?: number;
  fridgeDays?: number;
  freezable?: boolean;
  reheats?: boolean;
}
