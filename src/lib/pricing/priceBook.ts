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
 * Prix unitaire du format habituel de taille la plus proche (échelle logarithmique) :
 * un seau de 2 kg se compare au plus gros format, pas au pack de 4 yaourts.
 */
/**
 * Économie d'échelle : en rayon, le prix au kilo baisse d'environ 13 % quand le format double
 * (élasticité 0,2). Un relevé d'un format plus grand que le nôtre est donc corrigé à la hausse, et inversement.
 */
export const SIZE_ELASTICITY = 0.2;

/** Rapport « prix relevé / estimation » d'un relevé, ramené au format habituel le plus proche. */
function observedRatio(refs: readonly Package[], obs: Pick<Package, "quantity" | "label" | "priceCents">): number {
  const r = nearestRef(refs, obs);
  const raw = obs.priceCents / obs.quantity / (r.priceCents / r.quantity);
  return /prix au kilo/i.test(obs.label) ? raw : raw * (obs.quantity / r.quantity) ** SIZE_ELASTICITY;
}

/** Un seul relevé (souvent une marque) : on ne le suit qu'à moitié, entre l'estimation et le relevé. */
const shrink = (ratio: number, n: number) => (n >= 2 ? ratio : 1 + (ratio - 1) / 2);

/** Relevé « prix au kilo » (vrac) : comparé au format vrac ou à l'unité s'il existe, sinon au format de taille la plus proche. */
function nearestRef(refs: readonly Package[], obs: Pick<Package, "quantity" | "label">): Package {
  const loose = /prix au kilo/i.test(obs.label) ? refs.filter((r) => /vrac|unit[ée]|pi[èe]ce/i.test(r.label)) : [];
  const pool = loose.length ? loose : refs;
  return pool.reduce((best, x) => (Math.abs(Math.log(x.quantity / obs.quantity)) < Math.abs(Math.log(best.quantity / obs.quantity)) ? x : best));
}

/** Relevé trop éloigné en taille de tout format habituel (seau de 2 kg pour un pack de 4) : il ne dit rien de son prix. */
export const MAX_SIZE_GAP = 2.5;
function comparable(refs: readonly Package[], obs: Pick<Package, "quantity" | "label">): boolean {
  if (/prix au kilo/i.test(obs.label)) return true;
  const r = nearestRef(refs, obs);
  return Math.abs(Math.log(r.quantity / obs.quantity)) <= Math.log(MAX_SIZE_GAP);
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
    // Chaque relevé est comparé au format habituel de taille la plus proche : un seau de 2 kg
    // ne doit pas faire baisser le prix d'un pack de 4 yaourts (prix au kilo très différents).
    if (!refs.every((r) => r.priceCents > 0 && r.quantity > 0)) continue;
    const usable = obs.filter((p) => comparable(refs, p));
    if (!usable.length) continue;
    const median = shrink(medianOf(usable.map((p) => observedRatio(refs, p))), usable.length);
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
  const refBy = new Map<string, Package[]>();
  for (const p of reference) if (p.priceCents > 0 && p.quantity > 0) refBy.set(p.ingredientId, [...(refBy.get(p.ingredientId) ?? []), p]);
  const obs = new Map<string, number[]>();
  for (const p of observed) {
    const refs = refBy.get(p.ingredientId);
    if (!refs?.length || !comparable(refs, p)) continue;
    obs.set(p.ingredientId, [...(obs.get(p.ingredientId) ?? []), observedRatio(refs, p)]);
  }
  return new Map([...obs].map(([id, rs]) => [id, Math.min(max, Math.max(min, shrink(medianOf(rs), rs.length)))]));
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
