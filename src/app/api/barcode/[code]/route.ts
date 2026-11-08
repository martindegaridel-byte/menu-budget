import { fetchBarcodeProduct, isBarcode, matchBarcodeProduct } from "@/lib/pricing/barcode";
import { getCatalog } from "@/lib/server/catalog";
import { HttpError, route } from "@/lib/server/http";

export const maxDuration = 20;

type Ctx = { params: Promise<{ code: string }> };

/** Produit scanné : fiche Open Food Facts (via Open Prices) rattachée à un ingrédient de l'appli. */
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { code } = await params;
  if (!isBarcode(code)) throw new HttpError(400, "Code-barres invalide (8 à 14 chiffres).");
  const product = await fetchBarcodeProduct(code);
  if (!product) throw new HttpError(404, "Produit inconnu d'Open Food Facts : choisissez l'ingrédient à la main.");
  const { ingredientsById } = await getCatalog();
  return matchBarcodeProduct(product, ingredientsById);
});
