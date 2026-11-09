import { prisma } from "@/lib/server/db";
import { route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const dynamic = "force-dynamic";

/** Vos photos de plats : liste (recette + date de mise à jour, pour l'URL versionnée). */
export const GET = route(async () => {
  const userId = await getCurrentUserId();
  const rows = await prisma.recipePhoto.findMany({ where: { userId }, select: { recipeId: true, updatedAt: true } });
  return { photos: rows.map((r) => ({ recipeId: r.recipeId, version: r.updatedAt.getTime() })) };
});
