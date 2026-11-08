import { z } from "zod";

/** Fichier de sauvegarde « Mes données » : tout ce qui appartient à l'utilisateur, pour changer d'appareil. */
export const BACKUP_FORMAT = "menu-budget-sauvegarde";
export const BACKUP_VERSION = 1;

const id = z.string().min(1).max(200);
const json = z.string().max(500_000);

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  profile: z.object({ excludedIngredientIds: z.array(id).max(1000), allergens: z.array(id).max(50) }),
  stores: z
    .array(z.object({ id, name: z.string().min(1).max(200), chain: z.string().min(1).max(100), format: z.string().min(1).max(50), city: z.string().max(200).nullable(), priceIndex: z.number().int().min(50).max(200) }))
    .max(100),
  prices: z
    .array(
      z.object({
        ingredientId: id,
        chain: z.string().min(1).max(100),
        storeId: id.nullable(),
        label: z.string().min(1).max(300),
        brand: z.string().max(200).nullable(),
        quantity: z.number().positive(),
        priceCents: z.number().int().min(0),
        source: z.string().min(1).max(30),
        asOf: z.string().max(40),
      }),
    )
    .max(20_000),
  pantry: z.array(z.object({ ingredientId: id, quantity: z.number().nullable(), expiresOn: z.string().max(20).nullable() })).max(2000),
  menus: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        favorite: z.boolean(),
        preferencesJson: json,
        resultJson: json,
        totalCents: z.number().int(),
        budgetCents: z.number().int(),
        actualCents: z.number().int().nullable(),
        createdAt: z.string(),
      }),
    )
    .max(2000),
  favorites: z.array(id).max(5000),
  ratings: z.array(z.object({ recipeId: id, stars: z.number().int().min(1).max(5), note: z.string().max(2000) })).max(5000),
  unavailable: z.array(z.object({ storeId: id, ingredientId: id })).max(5000),
  /** Réglages de l'appareil (apparence, préférences, planning…), clés « mb:* ». */
  device: z.record(z.string().regex(/^mb:[a-z0-9:-]+$/), z.string().max(500_000)).default({}),
});
export type Backup = z.infer<typeof BackupSchema>;
