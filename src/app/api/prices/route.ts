import { z } from "zod";
import { PriceUpsertSchema } from "@/lib/domain/api";
import { getCatalog, getStore, prismaPriceProvider, REFERENCE_CHAIN } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

/** Prix effectifs d'un magasin (estimations ajustées + prix saisis), par ingrédient. */
export const GET = route(async (req: Request) => {
  const storeId = new URL(req.url).searchParams.get("storeId") ?? undefined;
  const userId = await getCurrentUserId();
  const store = await getStore(userId, storeId);
  const [book, unavailable] = await Promise.all([
    prismaPriceProvider.getPriceBook({ storeId: store.id, userId }),
    prisma.unavailableIngredient.findMany({ where: { userId, storeId: store.id } }),
  ]);
  return {
    store,
    prices: Object.fromEntries(book),
    unavailable: unavailable.map((u) => u.ingredientId),
  };
});

/** Saisie manuelle d'un prix (remplace le prix de même contenance pour ce magasin). */
export const POST = route(async (req: Request) => {
  const input = await parseBody(req, PriceUpsertSchema);
  const userId = await getCurrentUserId();
  const store = await getStore(userId, input.storeId);
  if (store.id !== input.storeId) throw new HttpError(404, "Magasin introuvable");
  const { ingredientsById } = await getCatalog();
  if (!ingredientsById.has(input.ingredientId)) throw new HttpError(400, "Ingrédient inconnu");
  await prisma.$transaction([
    prisma.package.deleteMany({
      where: { userId, storeId: store.id, ingredientId: input.ingredientId, quantity: input.quantity },
    }),
    prisma.package.create({
      data: {
        ...input,
        storeId: store.id,
        userId,
        chain: store.chain || REFERENCE_CHAIN,
        source: "manual",
        asOf: new Date().toISOString().slice(0, 10),
      },
    }),
  ]);
  return { ok: true };
});

/** Supprime un prix saisi (on revient à l'estimation). */
export const DELETE = route(async (req: Request) => {
  const { packageId } = await parseBody(req, z.object({ packageId: z.string().min(1) }));
  const userId = await getCurrentUserId();
  const { count } = await prisma.package.deleteMany({ where: { id: packageId, userId } });
  if (!count) throw new HttpError(404, "Prix introuvable");
  return { ok: true };
});
