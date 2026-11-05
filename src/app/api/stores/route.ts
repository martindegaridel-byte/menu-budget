import { StoreCreateSchema } from "@/lib/domain/api";
import { loadSeedData } from "@/lib/data/seed";
import { listStores } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const GET = route(async () => {
  const userId = await getCurrentUserId();
  return { stores: await listStores(userId), formatPriceIndex: loadSeedData().formatPriceIndex };
});

/** Ajoute un magasin (indice de prix par défaut selon le format). */
export const POST = route(async (req: Request) => {
  const input = await parseBody(req, StoreCreateSchema);
  const userId = await getCurrentUserId();
  const priceIndex = input.priceIndex ?? loadSeedData().formatPriceIndex[input.format] ?? 100;
  const store = await prisma.store.create({ data: { ...input, city: input.city ?? null, priceIndex, userId } });
  return { id: store.id };
});
