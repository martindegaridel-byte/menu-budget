import type { Aisle, Ingredient, Package, PantryItem, Recipe } from "@/lib/domain/schemas";
import type { Cents } from "./money";

/** Conditionnements disponibles dans le magasin choisi, par ingrédient. Absent = indisponible. */
export type PriceBook = ReadonlyMap<string, readonly Package[]>;

/** Tout ce dont le moteur a besoin, passé explicitement (fonctions pures). */
export interface EngineContext {
  ingredients: ReadonlyMap<string, Ingredient>;
  recipes: readonly Recipe[];
  priceBook: PriceBook;
  /** Placard de l'utilisateur (vide si l'option est désactivée). */
  pantry: ReadonlyMap<string, PantryItem>;
  /** Date du jour AAAA-MM-JJ (pour les produits qui périment bientôt). */
  today: string;
}

/** Besoins agrégés : ingrédient → quantité en unité de base. */
export type Needs = Map<string, number>;

export interface PackagePick {
  packageId: string;
  label: string;
  count: number;
  unitPriceCents: Cents;
}

export interface ShoppingLine {
  ingredientId: string;
  name: string;
  aisle: Aisle;
  unit: Ingredient["unit"];
  needed: number;
  fromPantry: number;
  toBuy: number;
  picks: PackagePick[];
  /** Quantité achetée (somme des conditionnements). */
  purchased: number;
  /** Reste après le menu (acheté − utilisé). */
  leftover: number;
  costCents: Cents;
  /** Coût de la seule part utilisée (indicatif, au prorata du meilleur prix unitaire). */
  usedCostCents: Cents;
  staple: boolean;
}

export interface ShoppingList {
  lines: ShoppingLine[];
  totalCents: Cents;
  usedCostCents: Cents;
  /** Ingrédients nécessaires mais introuvables (ni en magasin ni au placard). */
  unavailable: string[];
}
