import type { Package, Store } from "@/lib/domain/schemas";
import type { PriceBook } from "@/lib/engine/types";

/**
 * Source de prix branchable. Implémentations : seed (estimations Intermarché),
 * Prisma (estimations + prix saisis par l'utilisateur pour son magasin).
 * Plus tard : API d'enseigne, import de ticket, etc.
 */
export interface PriceProvider {
  getPriceBook(params: { storeId: string; userId?: string }): Promise<PriceBook>;
}

export interface ResolvePriceBookInput {
  /** Estimations de l'enseigne de référence. */
  referencePackages: readonly Package[];
  store: Pick<Store, "priceIndex">;
  /** Prix saisis/importés par l'utilisateur pour ce magasin (prioritaires). */
  storePackages?: readonly Package[];
  /** Ingrédients que l'utilisateur a signalés comme introuvables dans ce magasin. */
  unavailableIngredientIds?: readonly string[];
}

/**
 * Règles :
 * 0. Un ingrédient qui a des prix réels relevés (Open Prices) n'utilise plus les estimations.
 * 1. Un prix saisi pour ce magasin remplace l'estimation de même contenance.
 * 2. Les autres estimations restent disponibles, ajustées par l'indice de prix du magasin
 *    (arrondi au centime supérieur : on ne sous-estime pas).
 * 3. Un ingrédient signalé indisponible est retiré.
 */
export function resolvePriceBook(input: ResolvePriceBookInput): PriceBook {
  const book = new Map<string, Package[]>();
  const own = new Map<string, Package[]>();
  for (const p of input.storePackages ?? []) {
    own.set(p.ingredientId, [...(own.get(p.ingredientId) ?? []), p]);
  }
  for (const p of input.referencePackages) {
    const ownForIngredient = own.get(p.ingredientId);
    const overridden =
      ownForIngredient?.some((o) => o.source === "openprices") ||
      ownForIngredient?.some((o) => Math.abs(o.quantity - p.quantity) < 1e-6);
    if (overridden) continue;
    const priceCents = input.store.priceIndex === 100 ? p.priceCents : Math.ceil((p.priceCents * input.store.priceIndex) / 100);
    book.set(p.ingredientId, [...(book.get(p.ingredientId) ?? []), { ...p, priceCents }]);
  }
  for (const [id, pkgs] of own) book.set(id, [...(book.get(id) ?? []), ...pkgs]);
  for (const id of input.unavailableIngredientIds ?? []) book.delete(id);
  return book;
}

/**
 * Recale les estimations sur des prix réels relevés dans plusieurs magasins d'une enseigne :
 * on garde les formats habituels (petit flacon, boîte de 400 g…) mais au niveau de prix
 * constaté (rapport médian prix relevé / estimation, au kilo, borné entre `min` et `max`).
 * Les relevés seuls ne suffisent pas : ils ne couvrent souvent que de grands formats ou des marques.
 */
export function scaleToObserved(
  reference: readonly Package[],
  observed: readonly Package[],
  opts: { min?: number; max?: number } = {},
): Package[] {
  const min = opts.min ?? 0.6;
  const max = opts.max ?? 1.6;
  const refBy = new Map<string, Package[]>();
  for (const p of reference) refBy.set(p.ingredientId, [...(refBy.get(p.ingredientId) ?? []), p]);
  const obsBy = new Map<string, Package[]>();
  for (const p of observed) obsBy.set(p.ingredientId, [...(obsBy.get(p.ingredientId) ?? []), p]);
  const out: Package[] = [];
  for (const [id, obs] of obsBy) {
    const refs = refBy.get(id);
    if (!refs?.length) continue;
    const refUnit = Math.min(...refs.map((p) => p.priceCents / p.quantity));
    if (!(refUnit > 0)) continue;
    const ratios = obs.map((p) => p.priceCents / p.quantity / refUnit).sort((a, b) => a - b);
    const mid = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
    const ratio = Math.min(max, Math.max(min, median));
    const asOf = obs.map((p) => p.asOf).sort().at(-1)!;
    refs.forEach((p, i) =>
      out.push({ ...p, id: `observed:${id}:${i}`, priceCents: Math.max(1, Math.round(p.priceCents * ratio)), source: "openprices", asOf }),
    );
  }
  return out;
}

const medianOf = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * Rapport « prix relevé / estimation » de chaque ingrédient observé (au kilo, litre ou pièce),
 * borné comme dans `scaleToObserved`.
 */
function observedRatios(reference: readonly Package[], observed: readonly Package[], min: number, max: number): Map<string, number> {
  const refUnit = new Map<string, number>();
  for (const p of reference) refUnit.set(p.ingredientId, Math.min(refUnit.get(p.ingredientId) ?? Infinity, p.priceCents / p.quantity));
  const obs = new Map<string, number[]>();
  for (const p of observed) {
    const ref = refUnit.get(p.ingredientId);
    if (!ref || !(ref > 0)) continue;
    obs.set(p.ingredientId, [...(obs.get(p.ingredientId) ?? []), p.priceCents / p.quantity / ref]);
  }
  return new Map([...obs].map(([id, rs]) => [id, Math.min(max, Math.max(min, medianOf(rs)))]));
}

/**
 * Pas d'impasse sur un ingrédient sans relevé : son estimation est recalée sur le niveau de prix
 * constaté dans le même rayon (rapport médian des ingrédients observés), ou à défaut sur l'ensemble
 * du magasin. Le recalage est volontairement plus étroit que celui d'un relevé direct, car il
 * s'appuie sur d'autres produits. Les formats restent ceux de l'estimation (source « estimate »).
 */
export function indexUnobserved(
  reference: readonly Package[],
  observed: readonly Package[],
  aisleOf: (ingredientId: string) => string | undefined,
  opts: { min?: number; max?: number; minSample?: number; observedMin?: number; observedMax?: number } = {},
): Package[] {
  const min = opts.min ?? 0.8;
  const max = opts.max ?? 1.3;
  const minSample = opts.minSample ?? 3;
  const ratios = observedRatios(reference, observed, opts.observedMin ?? 0.6, opts.observedMax ?? 1.6);
  if (ratios.size < minSample) return [];
  const byAisle = new Map<string, number[]>();
  for (const [id, r] of ratios) {
    const aisle = aisleOf(id);
    if (aisle) byAisle.set(aisle, [...(byAisle.get(aisle) ?? []), r]);
  }
  const global = medianOf([...ratios.values()]);
  const asOf = observed.map((p) => p.asOf).sort().at(-1) ?? reference[0]?.asOf ?? "";
  const refBy = new Map<string, Package[]>();
  for (const p of reference) refBy.set(p.ingredientId, [...(refBy.get(p.ingredientId) ?? []), p]);
  const out: Package[] = [];
  for (const [id, refs] of refBy) {
    if (ratios.has(id)) continue;
    const sample = byAisle.get(aisleOf(id) ?? "");
    const ratio = Math.min(max, Math.max(min, sample && sample.length >= minSample ? medianOf(sample) : global));
    refs.forEach((p, i) => out.push({ ...p, id: `indexed:${id}:${i}`, priceCents: Math.max(1, Math.round(p.priceCents * ratio)), source: "estimate", asOf }));
  }
  return out;
}
