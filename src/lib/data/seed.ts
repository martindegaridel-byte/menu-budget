import { z } from "zod";
import ingredientsJson from "../../../data/ingredients.json";
import recipesJson from "../../../data/recipes.json";
import storesJson from "../../../data/stores.json";
import {
  IngredientSchema,
  PackageSchema,
  RecipeSchema,
  RecipeUnitSchema,
  StoreFormatSchema,
  StoreSchema,
  type Ingredient,
  type Package,
  type Recipe,
  type Store,
  type StoreFormat,
} from "@/lib/domain/schemas";

/* Formats compacts des fichiers seed → normalisés puis validés par Zod. */

const SeedPackageSchema = z.object({
  label: z.string(),
  brand: z.string().optional(),
  quantity: z.number().positive(),
  priceCents: z.number().int().nonnegative(),
});

const SeedIngredientsFileSchema = z.object({
  chain: z.string(),
  source: z.literal("estimate"),
  asOf: z.string(),
  note: z.string().optional(),
  ingredients: z.array(IngredientSchema.extend({ packages: z.array(SeedPackageSchema).min(1) })),
});

const SeedRecipeIngredientSchema = z.union([
  z.tuple([z.string(), z.number().positive(), RecipeUnitSchema]),
  z.tuple([z.string(), z.number().positive(), RecipeUnitSchema, z.boolean()]),
]);

const SeedRecipeSchema = RecipeSchema.omit({ ingredients: true }).extend({
  ingredients: z.array(SeedRecipeIngredientSchema).min(1),
});

const SeedStoresFileSchema = z.object({
  referenceChain: z.string(),
  formatPriceIndex: z.record(StoreFormatSchema, z.number().int()),
  stores: z.array(StoreSchema),
});

export interface SeedData {
  chain: string;
  asOf: string;
  ingredients: Ingredient[];
  /** Conditionnements de l'enseigne de référence (prix estimés). */
  packages: Package[];
  recipes: Recipe[];
  stores: Store[];
  formatPriceIndex: Partial<Record<StoreFormat, number>>;
}

let cache: SeedData | null = null;

/** Charge et valide les données seed (mise en cache après le premier appel). */
export function loadSeedData(): SeedData {
  if (cache) return cache;
  const ing = SeedIngredientsFileSchema.parse(ingredientsJson);
  const ingredients: Ingredient[] = [];
  const packages: Package[] = [];
  for (const { packages: pkgs, ...ingredient } of ing.ingredients) {
    ingredients.push(ingredient);
    pkgs.forEach((p, i) =>
      packages.push(
        PackageSchema.parse({
          id: `${ing.chain}:${ingredient.id}:${i}`,
          ingredientId: ingredient.id,
          ...p,
          source: ing.source,
          asOf: ing.asOf,
        }),
      ),
    );
  }
  const recipes = z
    .array(SeedRecipeSchema)
    .parse(recipesJson)
    .map((r) =>
      RecipeSchema.parse({
        ...r,
        ingredients: r.ingredients.map(([ingredientId, quantity, unit, optional]) => ({
          ingredientId,
          quantity,
          unit,
          optional: optional ?? false,
        })),
      }),
    );
  const stores = SeedStoresFileSchema.parse(storesJson);
  cache = {
    chain: ing.chain,
    asOf: ing.asOf,
    ingredients,
    packages,
    recipes,
    stores: stores.stores,
    formatPriceIndex: stores.formatPriceIndex,
  };
  return cache;
}
