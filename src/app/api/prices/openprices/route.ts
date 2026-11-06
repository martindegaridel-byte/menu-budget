import { z } from "zod";
import { bestUnitPrice } from "@/lib/engine/packaging";
import { matchOpenPrices, parseLocationId } from "@/lib/pricing/openprices";
import { fetchOpenPrices, fetchOpenPricesLocation, OPEN_PRICES_BASE } from "@/lib/pricing/openprices-client";
import { priceChanges } from "@/lib/pricing/priceChanges";
import { resolvePriceBook } from "@/lib/pricing/priceBook";
import { getCatalog, getStore, toPackage } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

const BodySchema = z.object({
  storeId: z.string().min(1),
  location: z.string().trim().min(1).max(200),
  /** Ancienneté maximale des relevés, en mois. */
  months: z.number().int().min(1).max(60).default(24),
});

/**
 * Importe les prix réels d'un magasin publiés sur Open Prices (Open Food Facts, ODbL)
 * et les rattache au magasin de l'utilisateur. Remplace l'import précédent.
 */
export const POST = route(async (req: Request) => {
  const { storeId, location, months } = await parseBody(req, BodySchema);
  const locationId = parseLocationId(location);
  if (!locationId) throw new HttpError(400, "Adresse ou numéro de magasin Open Prices invalide (ex. https://prices.openfoodfacts.org/locations/10).");
  const userId = await getCurrentUserId();
  const store = await getStore(userId, storeId);
  if (store.id !== storeId) throw new HttpError(404, "Magasin introuvable");

  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);
  const since = sinceDate.toISOString().slice(0, 10);

  let loc, prices;
  try {
    loc = await fetchOpenPricesLocation(locationId);
    prices = await fetchOpenPrices(locationId, { since });
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? `Open Prices injoignable : ${e.message}` : "Open Prices injoignable.");
  }

  const catalog = await getCatalog();
  const report = matchOpenPrices(prices, catalog.ingredientsById, catalog.referencePackages, store.id, { since });

  // Alertes de prix : comparaison avec l'import précédent (variations d'au moins 10 %).
  const previous = (await prisma.package.findMany({ where: { userId, storeId: store.id, source: "openprices" } })).map(toPackage);
  const book = resolvePriceBook({ referencePackages: catalog.referencePackages, store, storePackages: report.packages });
  const changes = priceChanges(previous, report.packages, catalog.ingredientsById, book);

  await prisma.$transaction([
    prisma.package.deleteMany({ where: { userId, storeId: store.id, source: "openprices" } }),
    prisma.package.createMany({
      data: report.packages.map((p) => ({
        userId,
        storeId: store.id,
        ingredientId: p.ingredientId,
        chain: store.chain,
        label: p.label,
        brand: p.brand ?? null,
        quantity: p.quantity,
        priceCents: p.priceCents,
        source: "openprices",
        asOf: p.asOf,
      })),
    }),
  ]);

  const refBest = (id: string) => bestUnitPrice(catalog.referencePackages.filter((p) => p.ingredientId === id));
  const items = report.matchedIngredientIds.map((id) => {
    const pkgs = report.packages.filter((p) => p.ingredientId === id);
    const best = Math.min(...pkgs.map((p) => p.priceCents / p.quantity));
    const ref = refBest(id);
    return {
      ingredientId: id,
      ingredientName: catalog.ingredientsById.get(id)?.name ?? id,
      ratio: ref ? Math.round((best / ref) * 100) / 100 : null,
      packages: pkgs.map((p) => ({ label: p.label, priceCents: p.priceCents, asOf: p.asOf })),
    };
  });

  return {
    location: {
      id: locationId,
      name: loc.osm_display_name ?? loc.osm_name ?? `Magasin ${locationId}`,
      url: `${OPEN_PRICES_BASE}/locations/${locationId}`,
      priceCount: loc.price_count,
    },
    since,
    fetched: prices.length,
    imported: report.packages.length,
    matchedIngredients: report.matchedIngredientIds.length,
    totalIngredients: catalog.ingredients.length,
    rejectedAsImplausible: report.rejectedAsImplausible,
    ignoredExpensive: report.rejectedAsExpensive,
    priceChanges: changes,
    items,
  };
});
