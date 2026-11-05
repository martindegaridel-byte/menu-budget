import { PriceImportSchema } from "@/lib/domain/api";
import { parsePriceCsv } from "@/lib/pricing/csv";
import { getCatalog, getStore } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { storeId, csv } = await parseBody(req, PriceImportSchema);
  const userId = await getCurrentUserId();
  const store = await getStore(userId, storeId);
  if (store.id !== storeId) throw new HttpError(404, "Magasin introuvable");
  const { ingredients } = await getCatalog();
  const { rows, errors } = parsePriceCsv(csv, ingredients);
  const asOf = new Date().toISOString().slice(0, 10);
  await prisma.$transaction(
    rows.flatMap((r) => [
      prisma.package.deleteMany({ where: { userId, storeId, ingredientId: r.ingredientId, quantity: r.quantity } }),
      prisma.package.create({
        data: {
          userId,
          storeId,
          ingredientId: r.ingredientId,
          label: r.label,
          quantity: r.quantity,
          priceCents: r.priceCents,
          chain: store.chain,
          source: "import",
          asOf,
        },
      }),
    ]),
  );
  return { imported: rows.length, errors };
});
