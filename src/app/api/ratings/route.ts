import { RatingPutSchema } from "@/lib/domain/api";
import { getCatalog } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

/** Vos notes de recettes (étoiles et commentaire). */
export const GET = route(async () => {
  const userId = await getCurrentUserId();
  const rows = await prisma.recipeRating.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return { ratings: rows.map((r) => ({ recipeId: r.recipeId, stars: r.stars, note: r.note, updatedAt: r.updatedAt })) };
});

/** Noter une recette (1 à 5 étoiles, commentaire facultatif) ; stars = null retire la note. */
export const PUT = route(async (req: Request) => {
  const { recipeId, stars, note } = await parseBody(req, RatingPutSchema);
  const { recipes } = await getCatalog();
  if (!recipes.some((r) => r.id === recipeId)) throw new HttpError(404, "Recette introuvable");
  const userId = await getCurrentUserId();
  if (stars === null) {
    await prisma.recipeRating.deleteMany({ where: { userId, recipeId } });
    return { ok: true, stars: null };
  }
  await prisma.recipeRating.upsert({
    where: { userId_recipeId: { userId, recipeId } },
    create: { userId, recipeId, stars, note: note ?? "" },
    update: { stars, ...(note !== undefined ? { note } : {}) },
  });
  return { ok: true, stars };
});
