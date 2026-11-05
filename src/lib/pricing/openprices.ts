import type { Ingredient, Package } from "@/lib/domain/schemas";
import { bestUnitPrice } from "@/lib/engine/packaging";
import { GLOBAL_NOT, OPEN_PRICES_RULES, type MatchRule } from "./openprices-rules";

/**
 * Import des prix réels publiés sur Open Prices (Open Food Facts, licence ODbL).
 * https://prices.openfoodfacts.org — données contributives : chaque prix vient
 * d'une photo de ticket ou d'étiquette.
 */

/** Champs utiles d'un prix renvoyé par GET /api/v1/prices. */
export interface OpenPrice {
  id: number;
  type: "PRODUCT" | "CATEGORY" | string;
  product_code: string | null;
  product_name: string | null;
  category_tag: string | null;
  price: number;
  price_is_discounted: boolean;
  price_per: "KILOGRAM" | "UNIT" | "LITER" | null | string;
  currency: string;
  date: string;
  product?: {
    product_name: string | null;
    product_quantity: number | null;
    product_quantity_unit: string | null;
    quantity: string | null;
    brands: string | null;
    categories_tags: string[];
  } | null;
}

export interface MatchOptions {
  /** Prix plus anciens ignorés (AAAA-MM-JJ). */
  since: string;
  /** Écart maximal toléré avec l'estimation (facteur). */
  maxRatio?: number;
  /** Nombre de formats gardés par ingrédient. */
  maxPackagesPerIngredient?: number;
}

export interface MatchedPackage extends Package {
  /** Identifiant Open Prices (pour la traçabilité). */
  openPriceId: number;
  productName: string;
}

export interface MatchReport {
  packages: MatchedPackage[];
  /** Ingrédients pour lesquels un prix réel a été trouvé. */
  matchedIngredientIds: string[];
  /** Prix écartés car trop éloignés de l'estimation (souvent une mauvaise association). */
  rejectedAsImplausible: number;
  considered: number;
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const globalNot = new RegExp(GLOBAL_NOT);
const compiled = new Map<string, { name?: RegExp; not?: RegExp; cats?: Set<string> }>();
function compile(id: string, rule: MatchRule) {
  let c = compiled.get(id);
  if (!c) {
    c = {
      name: rule.name ? new RegExp(rule.name) : undefined,
      not: rule.not ? new RegExp(rule.not) : undefined,
      cats: rule.cats ? new Set(rule.cats) : undefined,
    };
    compiled.set(id, c);
  }
  return c;
}

/** Ingrédients candidats pour un prix (selon nom et catégories). */
export function candidateIngredients(p: OpenPrice): string[] {
  const rawName = p.product?.product_name || p.product_name || "";
  const name = normalizeName(rawName);
  const cats = new Set([...(p.product?.categories_tags ?? []), ...(p.category_tag ? [p.category_tag] : [])]);
  const out: string[] = [];
  if (globalNot.test(name)) return out;
  for (const [id, rule] of Object.entries(OPEN_PRICES_RULES)) {
    const c = compile(id, rule);
    if (c.not && c.not.test(name)) continue;
    const byName = !!c.name && name.length > 0 && c.name.test(name);
    const byCat = !!c.cats && [...cats].some((t) => c.cats!.has(t));
    if (byName || byCat) out.push(id);
  }
  return out;
}

const UNIT_TO_BASE: Record<string, { base: "g" | "ml"; factor: number }> = {
  g: { base: "g", factor: 1 },
  gr: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  mg: { base: "g", factor: 0.001 },
  ml: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  dl: { base: "ml", factor: 100 },
  l: { base: "ml", factor: 1000 },
};

/** Nombre de pièces lu dans le nom ou la contenance (« boîte de 6 », « x8 », « 12 œufs »). */
function pieceCount(p: OpenPrice): number | null {
  const text = normalizeName(`${p.product?.product_name ?? p.product_name ?? ""} ${p.product?.quantity ?? ""}`);
  const m =
    text.match(/\b(\d{1,2}) ?(x|pieces?|pcs?|oeufs?|tortillas?|wraps?|pains?|galettes?|cubes?|tablettes?|buns|feuilles?|unites?)\b/) ??
    text.match(/\bx ?(\d{1,2})\b/) ??
    text.match(/\b(boite|lot|paquet|sachet) de (\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[2] && /^\d+$/.test(m[2]) ? m[2] : m[1]);
  return n > 0 && n <= 60 ? n : null;
}

/** Contenance du produit dans l'unité de base de l'ingrédient (ou null si inconnue). */
export function quantityInBaseUnit(p: OpenPrice, ing: Ingredient): number | null {
  if (p.type === "CATEGORY") {
    if (p.price_per === "KILOGRAM") return ing.unit === "g" ? 1000 : null;
    if (p.price_per === "LITER") return ing.unit === "ml" ? 1000 : null;
    if (p.price_per === "UNIT") return ing.unit === "piece" ? 1 : (ing.gramsPerPiece ?? null);
    return null;
  }
  if (ing.unit === "piece") {
    if (/^pate-(brisee|feuilletee|pizza)$/.test(ing.id)) return 1;
    return pieceCount(p);
  }
  const q = p.product?.product_quantity;
  const u = (p.product?.product_quantity_unit ?? "g").toLowerCase();
  const conv = UNIT_TO_BASE[u];
  if (!q || q <= 0 || !conv) return null;
  // g et ml sont interchangeables (densité ≈ 1), comme dans le reste du moteur.
  return q * conv.factor;
}

function packageLabel(p: OpenPrice, quantity: number, ing: Ingredient): string {
  const name = (p.product?.product_name || p.product_name || p.category_tag || ing.name).trim();
  const brand = p.product?.brands?.split(",")[0]?.trim();
  const qty =
    ing.unit === "piece" ? `${quantity} pièce${quantity > 1 ? "s" : ""}` : quantity >= 1000 ? `${quantity / 1000} ${ing.unit === "g" ? "kg" : "L"}` : `${Math.round(quantity)} ${ing.unit}`;
  const perKg = p.type === "CATEGORY" && p.price_per !== "UNIT" ? " (prix au kilo)" : "";
  return `${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} · ` : ""}${name} — ${qty}${perKg}`.slice(0, 80);
}

/**
 * Associe les prix Open Prices d'un magasin aux ingrédients de l'appli.
 * Règles : dernier prix par produit, prix promotionnels ignorés, prix trop anciens
 * ignorés, garde-fou de vraisemblance face à l'estimation, puis on garde les formats
 * au meilleur prix unitaire (un par contenance).
 */
export function matchOpenPrices(
  prices: readonly OpenPrice[],
  ingredients: ReadonlyMap<string, Ingredient>,
  referencePackages: readonly Package[],
  storeKey: string,
  opts: MatchOptions,
): MatchReport {
  const maxRatio = opts.maxRatio ?? 3;
  const keep = opts.maxPackagesPerIngredient ?? 3;
  const refByIngredient = new Map<string, Package[]>();
  for (const p of referencePackages) refByIngredient.set(p.ingredientId, [...(refByIngredient.get(p.ingredientId) ?? []), p]);

  // Dernier relevé (hors promotion) par produit / catégorie.
  const latest = new Map<string, OpenPrice>();
  for (const p of prices) {
    if (p.currency !== "EUR" || p.price_is_discounted || !(p.price > 0) || p.date < opts.since) continue;
    const key = p.product_code ?? `${p.category_tag}|${p.price_per}`;
    const cur = latest.get(key);
    if (!cur || p.date > cur.date || (p.date === cur.date && p.id > cur.id)) latest.set(key, p);
  }

  const byIngredient = new Map<string, { p: OpenPrice; quantity: number; unitPrice: number }[]>();
  let rejected = 0;
  for (const p of latest.values()) {
    for (const id of candidateIngredients(p)) {
      const ing = ingredients.get(id);
      if (!ing) continue;
      const quantity = quantityInBaseUnit(p, ing);
      if (!quantity) continue;
      const unitPrice = (p.price * 100) / quantity;
      const ref = bestUnitPrice(refByIngredient.get(id) ?? []);
      if (ref && (unitPrice > ref * maxRatio || unitPrice < ref / maxRatio)) {
        rejected++;
        continue;
      }
      byIngredient.set(id, [...(byIngredient.get(id) ?? []), { p, quantity, unitPrice }]);
    }
  }

  const packages: MatchedPackage[] = [];
  for (const [id, list] of byIngredient) {
    const ing = ingredients.get(id)!;
    const bestPerSize = new Map<number, (typeof list)[number]>();
    for (const c of list) {
      const k = Math.round(c.quantity);
      const cur = bestPerSize.get(k);
      if (!cur || c.unitPrice < cur.unitPrice) bestPerSize.set(k, c);
    }
    [...bestPerSize.values()]
      .sort((a, b) => a.unitPrice - b.unitPrice)
      .slice(0, keep)
      .forEach((c) =>
        packages.push({
          id: `openprices:${storeKey}:${c.p.id}:${id}`,
          ingredientId: id,
          label: packageLabel(c.p, c.quantity, ing),
          brand: c.p.product?.brands?.split(",")[0]?.trim() || undefined,
          quantity: c.quantity,
          priceCents: Math.round(c.p.price * 100),
          source: "openprices",
          asOf: c.p.date,
          openPriceId: c.p.id,
          productName: c.p.product?.product_name || c.p.product_name || c.p.category_tag || ing.name,
        }),
      );
  }
  packages.sort((a, b) => a.ingredientId.localeCompare(b.ingredientId) || a.priceCents - b.priceCents);
  return {
    packages,
    matchedIngredientIds: [...new Set(packages.map((p) => p.ingredientId))].sort(),
    rejectedAsImplausible: rejected,
    considered: latest.size,
  };
}

/** Accepte un numéro (« 10 ») ou une adresse « …/locations/10 ». */
export function parseLocationId(input: string): number | null {
  const m = input.trim().match(/(?:locations\/)?(\d{1,9})\/?$/);
  return m ? Number(m[1]) : null;
}
