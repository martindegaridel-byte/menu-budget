import { UnavailableSchema } from "@/lib/domain/api";
import { getStore } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

/** Signale (ou non) un ingrédient comme introuvable dans un magasin. */
export const POST = route(async (req: Request) => {
  const { storeId, ingredientId, unavailable } = await parseBody(req, UnavailableSchema);
  const userId = await getCurrentUserId();
  const store = await getStore(userId, storeId);
  if (store.id !== storeId) throw new HttpError(404, "Magasin introuvable");
  const key = { userId_storeId_ingredientId: { userId, storeId, ingredientId } };
  if (unavailable) await prisma.unavailableIngredient.upsert({ where: key, create: { userId, storeId, ingredientId }, update: {} });
  else await prisma.unavailableIngredient.deleteMany({ where: { userId, storeId, ingredientId } });
  return { ok: true };
});
