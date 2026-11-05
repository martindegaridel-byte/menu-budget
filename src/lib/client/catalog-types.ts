import type { Aisle, BaseUnit } from "@/lib/domain/schemas";

/** Données de catalogue légères passées des composants serveur aux composants client. */
export interface IngredientOption {
  id: string;
  name: string;
  aisle: Aisle;
  unit: BaseUnit;
  staple: boolean;
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  totalMinutes: number;
  difficulty: number;
  tags: string[];
}
