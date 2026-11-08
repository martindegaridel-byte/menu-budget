import { BACKUP_FORMAT, BACKUP_VERSION, type Backup } from "@/lib/domain/backup";
import { prisma } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { getProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

export const dynamic = "force-dynamic";

/** Toutes vos données serveur, à enregistrer dans un fichier (les réglages de l'appareil sont ajoutés par le navigateur). */
export const GET = route(async () => {
  const userId = await getCurrentUserId();
  const [profile, stores, prices, pantry, menus, favorites, ratings, unavailable] = await Promise.all([
    getProfile(userId),
    prisma.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.package.findMany({ where: { userId } }),
    prisma.pantryItem.findMany({ where: { userId } }),
    prisma.savedMenu.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.favoriteRecipe.findMany({ where: { userId } }),
    prisma.recipeRating.findMany({ where: { userId } }),
    prisma.unavailableIngredient.findMany({ where: { userId } }),
  ]);
  const backup: Omit<Backup, "device"> = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    stores: stores.map((s) => ({ id: s.id, name: s.name, chain: s.chain, format: s.format, city: s.city, priceIndex: s.priceIndex })),
    prices: prices.map((p) => ({
      ingredientId: p.ingredientId,
      chain: p.chain,
      storeId: p.storeId,
      label: p.label,
      brand: p.brand,
      quantity: p.quantity,
      priceCents: p.priceCents,
      source: p.source,
      asOf: p.asOf,
    })),
    pantry: pantry.map((p) => ({ ingredientId: p.ingredientId, quantity: p.quantity, expiresOn: p.expiresOn })),
    menus: menus.map((m) => ({
      name: m.name,
      favorite: m.favorite,
      preferencesJson: m.preferencesJson,
      resultJson: m.resultJson,
      totalCents: m.totalCents,
      budgetCents: m.budgetCents,
      actualCents: m.actualCents,
      createdAt: m.createdAt.toISOString(),
    })),
    favorites: favorites.map((f) => f.recipeId),
    ratings: ratings.map((r) => ({ recipeId: r.recipeId, stars: r.stars, note: r.note })),
    unavailable: unavailable.map((u) => ({ storeId: u.storeId, ingredientId: u.ingredientId })),
  };
  return backup;
});
