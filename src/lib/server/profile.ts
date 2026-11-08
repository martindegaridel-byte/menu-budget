import { applyProfile, EMPTY_PROFILE, ProfileSchema, type Profile } from "@/lib/domain/profile";
import type { Preferences } from "@/lib/domain/schemas";
import { prisma } from "./db";

export async function getProfile(userId: string): Promise<Profile> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { excludedIngredientsJson: true, allergensJson: true } });
  if (!u) return EMPTY_PROFILE;
  const parsed = ProfileSchema.safeParse({
    excludedIngredientIds: JSON.parse(u.excludedIngredientsJson),
    allergens: JSON.parse(u.allergensJson),
  });
  return parsed.success ? parsed.data : EMPTY_PROFILE;
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { excludedIngredientsJson: JSON.stringify(profile.excludedIngredientIds), allergensJson: JSON.stringify(profile.allergens) },
  });
}

/** Notes de l'utilisateur : recette → étoiles. */
export async function getRatings(userId: string): Promise<Record<string, number>> {
  const rows = await prisma.recipeRating.findMany({ where: { userId }, select: { recipeId: true, stars: true } });
  return Object.fromEntries(rows.map((r) => [r.recipeId, r.stars]));
}

/**
 * Préférences du menu + exclusions permanentes et notes de l'utilisateur (toujours
 * prises côté serveur, jamais reprises du client).
 */
export async function withProfile(userId: string, prefs: Preferences): Promise<Preferences> {
  const [profile, ratings] = await Promise.all([getProfile(userId), getRatings(userId)]);
  return { ...applyProfile(prefs, profile), ratings };
}
