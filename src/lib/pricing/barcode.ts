import type { Ingredient } from "@/lib/domain/schemas";
import { candidatesForName, isExcludedProduct, quantityInBaseUnit, type OpenPrice } from "./openprices";
import { parseReceipt } from "./receipt";

/** Fiche produit (Open Food Facts / Open Prices, licence ODbL), champs utiles. */
export interface BarcodeProduct {
  code: string;
  product_name: string | null;
  brands: string | null;
  quantity: string | null;
  product_quantity: number | null;
  product_quantity_unit: string | null;
  categories_tags: string[];
}

export interface BarcodeMatch {
  code: string;
  name: string;
  brand: string | null;
  /** Contenance lue sur la fiche (ex. « 500 g »). */
  quantityLabel: string | null;
  ingredientId: string | null;
  alternatives: string[];
  /** Quantité en unité de base de l'ingrédient (null = « suffisant » ou inconnue). */
  quantity: number | null;
}

export const isBarcode = (code: string) => /^\d{8,14}$/.test(code);

/** Rattache un produit scanné à un ingrédient de l'appli et lit sa contenance. */
export function matchBarcodeProduct(product: BarcodeProduct, ingredients: ReadonlyMap<string, Ingredient>): BarcodeMatch {
  const name = product.product_name?.trim() || "";
  let candidates = candidatesForName(name, product.categories_tags ?? []).filter((id) => ingredients.has(id));
  if (candidates.length === 0 && name && !isExcludedProduct(name)) {
    const options = [...ingredients.values()].map(({ id, name: n, unit, staple }) => ({ id, name: n, unit, staple }));
    const [line] = parseReceipt(`${name} 1,00`, options);
    candidates = line?.ingredientId ? [line.ingredientId, ...line.alternatives] : [];
  }
  const ingredientId = candidates[0] ?? null;
  const ing = ingredientId ? ingredients.get(ingredientId) : undefined;
  let quantity: number | null = null;
  if (ing && !ing.staple) {
    const asPrice = { type: "PRODUCT", product: { ...product, product_name: name } } as unknown as OpenPrice;
    quantity = quantityInBaseUnit(asPrice, ing) ?? (ing.unit === "piece" ? 1 : null);
  }
  return {
    code: product.code,
    name: name || `Produit ${product.code}`,
    brand: product.brands?.split(",")[0]?.trim() || null,
    quantityLabel: product.quantity || (product.product_quantity ? `${product.product_quantity} ${product.product_quantity_unit ?? "g"}` : null),
    ingredientId,
    alternatives: candidates.slice(1, 4),
    quantity,
  };
}

const UA = { "User-Agent": "MenuBudget/1.0 (application de menus)" };

/** Cherche la fiche d'un code-barres : Open Prices d'abord, puis Open Food Facts. */
export async function fetchBarcodeProduct(code: string): Promise<BarcodeProduct | null> {
  const fields = "code,product_name,brands,quantity,product_quantity,product_quantity_unit,categories_tags";
  try {
    const r = await fetch(`https://prices.openfoodfacts.org/api/v1/products/code/${code}`, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = (await r.json()) as Partial<BarcodeProduct>;
      if (d.product_name) return { code, product_name: d.product_name, brands: d.brands ?? null, quantity: d.quantity ?? null, product_quantity: d.product_quantity ?? null, product_quantity_unit: d.product_quantity_unit ?? null, categories_tags: d.categories_tags ?? [] };
    }
  } catch {
    /* on essaie la source suivante */
  }
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { status?: number; product?: Partial<BarcodeProduct> };
    if (!d.product?.product_name) return null;
    const p = d.product;
    return { code, product_name: p.product_name ?? null, brands: p.brands ?? null, quantity: p.quantity ?? null, product_quantity: p.product_quantity ?? null, product_quantity_unit: p.product_quantity_unit ?? null, categories_tags: p.categories_tags ?? [] };
  } catch {
    return null;
  }
}
