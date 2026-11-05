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

/** Préférences du menu + exclusions permanentes de l'utilisateur (toujours appliquées côté serveur). */
export async function withProfile(userId: string, prefs: Preferences): Promise<Preferences> {
  return applyProfile(prefs, await getProfile(userId));
}
