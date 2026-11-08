import { BackupSchema } from "@/lib/domain/backup";
import { ProfileSchema } from "@/lib/domain/profile";
import { prisma } from "@/lib/server/db";
import { parseBody, route } from "@/lib/server/http";
import { getProfile, saveProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

/**
 * Restaure un fichier de sauvegarde en le FUSIONNANT avec les données actuelles :
 * rien n'est effacé, les doublons sont ignorés, les éléments inconnus (recette ou ingrédient disparus) aussi.
 */
export const POST = route(async (req: Request) => {
  const b = await parseBody(req, BackupSchema);
  const userId = await getCurrentUserId();

  const [ingredientRows, recipeRows, sharedStores] = await Promise.all([
    prisma.ingredient.findMany({ select: { id: true } }),
    prisma.recipe.findMany({ select: { id: true } }),
    prisma.store.findMany({ where: { userId: null }, select: { id: true } }),
  ]);
  const ingredients = new Set(ingredientRows.map((i) => i.id));
  const recipes = new Set(recipeRows.map((r) => r.id));
  const count = { stores: 0, prices: 0, pantry: 0, menus: 0, favorites: 0, ratings: 0 };

  // Exclusions : union avec celles déjà en place.
  const current = await getProfile(userId);
  const merged = ProfileSchema.safeParse({
    excludedIngredientIds: [...new Set([...current.excludedIngredientIds, ...b.profile.excludedIngredientIds.filter((i) => ingredients.has(i))])],
    allergens: [...new Set([...current.allergens, ...b.profile.allergens])],
  });
  if (merged.success) await saveProfile(userId, merged.data);

  // Magasins : l'identifiant change d'un compte à l'autre, on retrouve un magasin identique ou on le crée.
  const storeIds = new Map<string, string>(sharedStores.map((s) => [s.id, s.id]));
  const mine = await prisma.store.findMany({ where: { userId } });
  for (const s of b.stores) {
    const same = mine.find((m) => m.id === s.id || (m.name === s.name && m.chain === s.chain && m.format === s.format));
    if (same) {
      storeIds.set(s.id, same.id);
      continue;
    }
    const created = await prisma.store.create({ data: { userId, name: s.name, chain: s.chain, format: s.format, city: s.city, priceIndex: s.priceIndex } });
    storeIds.set(s.id, created.id);
    count.stores++;
  }

  // Prix saisis ou importés.
  const existingPrices = await prisma.package.findMany({ where: { userId }, select: { ingredientId: true, storeId: true, label: true, priceCents: true } });
  const priceKey = (p: { ingredientId: string; storeId: string | null; label: string; priceCents: number }) => `${p.ingredientId}|${p.storeId}|${p.label}|${p.priceCents}`;
  const seenPrices = new Set(existingPrices.map(priceKey));
  const newPrices = b.prices.flatMap((p) => {
    const storeId = p.storeId === null ? null : storeIds.get(p.storeId);
    if (storeId === undefined || !ingredients.has(p.ingredientId)) return [];
    const row = { ...p, storeId, userId };
    if (seenPrices.has(priceKey(row))) return [];
    seenPrices.add(priceKey(row));
    return [row];
  });
  if (newPrices.length) count.prices = (await prisma.package.createMany({ data: newPrices })).count;

  // Placard : le fichier complète ce qui manque, sans écraser ce qui est déjà noté.
  const pantryHave = new Set((await prisma.pantryItem.findMany({ where: { userId }, select: { ingredientId: true } })).map((p) => p.ingredientId));
  const pantry = b.pantry.filter((p) => ingredients.has(p.ingredientId) && !pantryHave.has(p.ingredientId));
  if (pantry.length) count.pantry = (await prisma.pantryItem.createMany({ data: pantry.map((p) => ({ ...p, userId })) })).count;

  // Menus enregistrés (même nom et même date = déjà là).
  const menusHave = new Set((await prisma.savedMenu.findMany({ where: { userId }, select: { name: true, createdAt: true } })).map((m) => `${m.name}|${m.createdAt.toISOString()}`));
  const menus = b.menus.filter((m) => !menusHave.has(`${m.name}|${new Date(m.createdAt).toISOString()}`));
  if (menus.length) count.menus = (await prisma.savedMenu.createMany({ data: menus.map((m) => ({ ...m, createdAt: new Date(m.createdAt), userId })) })).count;

  // Favoris et notes.
  const favHave = new Set((await prisma.favoriteRecipe.findMany({ where: { userId }, select: { recipeId: true } })).map((f) => f.recipeId));
  const favs = [...new Set(b.favorites)].filter((r) => recipes.has(r) && !favHave.has(r));
  if (favs.length) count.favorites = (await prisma.favoriteRecipe.createMany({ data: favs.map((recipeId) => ({ userId, recipeId })) })).count;
  const rateHave = new Set((await prisma.recipeRating.findMany({ where: { userId }, select: { recipeId: true } })).map((r) => r.recipeId));
  const ratings = b.ratings.filter((r) => recipes.has(r.recipeId) && !rateHave.has(r.recipeId));
  if (ratings.length) count.ratings = (await prisma.recipeRating.createMany({ data: ratings.map((r) => ({ ...r, userId })) })).count;

  // Produits introuvables en magasin.
  const unHave = new Set((await prisma.unavailableIngredient.findMany({ where: { userId } })).map((u) => `${u.storeId}|${u.ingredientId}`));
  const unavailable = b.unavailable
    .map((u) => ({ storeId: storeIds.get(u.storeId), ingredientId: u.ingredientId, userId }))
    .filter((u): u is typeof u & { storeId: string } => !!u.storeId && ingredients.has(u.ingredientId) && !unHave.has(`${u.storeId}|${u.ingredientId}`));
  if (unavailable.length) await prisma.unavailableIngredient.createMany({ data: unavailable });

  return { imported: count };
});
