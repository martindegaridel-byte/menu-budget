import { z } from "zod";
import { PantryItemSchema, PreferencesSchema, StoreFormatSchema } from "./schemas";

const recipeIds = z.array(z.string().min(1)).min(1).max(21);

export const GenerateRequestSchema = z.object({
  preferences: PreferencesSchema,
  initial: z.array(z.string()).max(21).optional(),
});

/** « Que faire avec ce que j'ai ? » : recettes qui utilisent ces ingrédients du placard. */
export const SuggestRequestSchema = z.object({
  preferences: PreferencesSchema,
  ingredientIds: z.array(z.string().min(1)).min(1).max(5),
});

export const EvaluateRequestSchema = z.object({ preferences: PreferencesSchema, recipeIds });

export const SwapRequestSchema = z.object({
  preferences: PreferencesSchema,
  recipeIds,
  slot: z.number().int().min(0).max(20),
});

export const SaveMenuRequestSchema = z.object({
  name: z.string().trim().max(80).optional(),
  preferences: PreferencesSchema,
  recipeIds,
  favorite: z.boolean().optional(),
});

export const UpdateMenuRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  favorite: z.boolean().optional(),
  /** Montant réellement payé (centimes), null pour l'effacer. */
  actualCents: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
});

export const PantryPutSchema = z.object({ items: z.array(PantryItemSchema).max(500) });

export const StoreCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  chain: z.string().trim().min(1).max(40),
  format: StoreFormatSchema,
  city: z.string().trim().max(80).optional(),
  priceIndex: z.number().int().min(50).max(200).optional(),
});
export const StoreUpdateSchema = StoreCreateSchema.partial();

export const PriceUpsertSchema = z.object({
  storeId: z.string().min(1),
  ingredientId: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  quantity: z.number().positive(),
  priceCents: z.number().int().nonnegative().max(100_000),
});

export const PriceImportSchema = z.object({ storeId: z.string().min(1), csv: z.string().max(200_000) });

export const UnavailableSchema = z.object({
  storeId: z.string().min(1),
  ingredientId: z.string().min(1),
  unavailable: z.boolean(),
});

export const FavoriteRecipeSchema = z.object({ recipeId: z.string().min(1), favorite: z.boolean() });
