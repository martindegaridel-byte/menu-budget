import { FavoriteRecipeSchema } from "@/lib/domain/api";
import { prisma } from "@/lib/server/db";
import { parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const GET = route(async () => {
  const userId = await getCurrentUserId();
  const rows = await prisma.favoriteRecipe.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return { recipeIds: rows.map((r) => r.recipeId) };
});

export const POST = route(async (req: Request) => {
  const { recipeId, favorite } = await parseBody(req, FavoriteRecipeSchema);
  const userId = await getCurrentUserId();
  if (favorite) {
    await prisma.favoriteRecipe.upsert({
      where: { userId_recipeId: { userId, recipeId } },
      create: { userId, recipeId },
      update: {},
    });
  } else {
    await prisma.favoriteRecipe.deleteMany({ where: { userId, recipeId } });
  }
  return { ok: true };
});
