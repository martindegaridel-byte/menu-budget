import type { IngredientOption } from "./catalog-types";

/** Remplaçants d'un ingrédient : proximité culinaire et écart de prix dans le magasin choisi. Pur et testable. */

/** Proximité d'un remplaçant : même famille (base, viande, poisson…), même origine, même rayon. */
export function closeness(a: Pick<IngredientOption, "tags" | "animal" | "aisle">, b: Pick<IngredientOption, "tags" | "animal" | "aisle">): number {
  const shared = (a.tags ?? []).filter((t) => (b.tags ?? []).includes(t)).length;
  return shared * 4 + (a.animal && a.animal === b.animal ? 2 : 0) + (a.aisle === b.aisle ? 1 : 0);
}

/** Meilleur prix unitaire de chaque ingrédient (centimes par g, ml ou pièce), d'après les conditionnements du magasin. */
export function unitPrices(prices: Record<string, readonly { quantity: number; priceCents: number }[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, pkgs] of Object.entries(prices)) {
    const best = Math.min(...pkgs.filter((p) => p.quantity > 0).map((p) => p.priceCents / p.quantity));
    if (Number.isFinite(best)) out.set(id, best);
  }
  return out;
}

/** Écart de prix du remplaçant par rapport à l'ingrédient d'origine, en % arrondi (null si un prix manque). */
export function priceDeltaPct(fromId: string, toId: string, prices: ReadonlyMap<string, number>): number | null {
  const a = prices.get(fromId);
  const b = prices.get(toId);
  if (!a || b === undefined) return null;
  return Math.round(((b - a) / a) * 100);
}

/** Prix lisible : au kilo, au litre ou à la pièce. */
export function perUnitLabel(centsPerUnit: number, unit: "g" | "ml" | "piece"): { cents: number; per: string } {
  if (unit === "piece") return { cents: Math.round(centsPerUnit), per: "pièce" };
  return { cents: Math.round(centsPerUnit * 1000), per: unit === "g" ? "kg" : "L" };
}

/** Écart minimal (en %) pour parler de « moins cher ». */
export const CHEAPER_PCT = -10;
/** Proximité minimale pour suggérer un remplaçant d'office (au moins une famille commune). */
export const CLOSE_ENOUGH = 4;

/** Jusqu'à `max` remplaçants proches et nettement moins chers, les plus proches puis les moins chers d'abord. */
export function cheaperSuggestions<T extends Pick<IngredientOption, "id" | "tags" | "animal" | "aisle">>(
  source: T,
  candidates: readonly T[],
  prices: ReadonlyMap<string, number>,
  max = 3,
): T[] {
  return candidates
    .map((c) => ({ c, close: closeness(source, c), delta: priceDeltaPct(source.id, c.id, prices) }))
    .filter((x) => x.close >= CLOSE_ENOUGH && x.delta !== null && x.delta <= CHEAPER_PCT)
    .sort((a, b) => b.close - a.close || a.delta! - b.delta!)
    .slice(0, max)
    .map((x) => x.c);
}
