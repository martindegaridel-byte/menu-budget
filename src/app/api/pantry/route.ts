import { PantryPutSchema } from "@/lib/domain/api";
import { getCatalog, getPantry } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const GET = route(async () => ({ items: await getPantry(await getCurrentUserId()) }));

/** Remplace le contenu du placard. */
export const PUT = route(async (req: Request) => {
  const { items } = await parseBody(req, PantryPutSchema);
  const userId = await getCurrentUserId();
  const { ingredientsById } = await getCatalog();
  const unknown = items.filter((i) => !ingredientsById.has(i.ingredientId));
  if (unknown.length) throw new HttpError(400, `Ingrédient inconnu : ${unknown.map((i) => i.ingredientId).join(", ")}`);
  const unique = [...new Map(items.map((i) => [i.ingredientId, i])).values()];
  await prisma.$transaction([
    prisma.pantryItem.deleteMany({ where: { userId } }),
    prisma.pantryItem.createMany({
      data: unique.map((i) => ({ userId, ingredientId: i.ingredientId, quantity: i.quantity, expiresOn: i.expiresOn ?? null })),
    }),
  ]);
  return { items: await getPantry(userId) };
});
