import type { Ingredient, Package } from "@/lib/domain/schemas";
import { bestUnitPrice } from "@/lib/engine/packaging";

export interface PriceChange {
  ingredientId: string;
  name: string;
  /** Meilleur prix unitaire (centimes par unité de base) avant / après. */
  beforeUnit: number;
  afterUnit: number;
  /** Variation en %, arrondie (positive = hausse). */
  pct: number;
  /** Ingrédient proche (même famille, même unité) moins cher, si la hausse en justifie un. */
  alternative: { id: string; name: string } | null;
}

/** Seuil de signalement : ±10 %. */
export const PRICE_CHANGE_THRESHOLD = 0.1;

/** Familles qui permettent de proposer un remplaçant crédible. */
const FAMILY = /^(base:|boeuf$|porc$|volaille$|agneau$|veau$|fromage$|proteine-vegetale$)/;

/**
 * Compare deux imports de prix (par ingrédient, meilleur prix unitaire) et signale les
 * variations d'au moins 10 %. Pour une hausse, propose l'ingrédient de la même famille
 * le moins cher (d'après `currentBook`) s'il coûte nettement moins.
 */
export function priceChanges(
  previous: readonly Package[],
  next: readonly Package[],
  ingredients: ReadonlyMap<string, Ingredient>,
  currentBook: ReadonlyMap<string, readonly Package[]>,
): PriceChange[] {
  const group = (pkgs: readonly Package[]) => {
    const m = new Map<string, Package[]>();
    for (const p of pkgs) m.set(p.ingredientId, [...(m.get(p.ingredientId) ?? []), p]);
    return m;
  };
  const before = group(previous);
  const after = group(next);
  const out: PriceChange[] = [];
  for (const [id, pkgs] of after) {
    const b = bestUnitPrice(before.get(id) ?? []);
    const a = bestUnitPrice(pkgs);
    if (!b || !a) continue;
    const ratio = a / b - 1;
    if (Math.abs(ratio) < PRICE_CHANGE_THRESHOLD) continue;
    const ing = ingredients.get(id);
    let alternative: PriceChange["alternative"] = null;
    if (ratio > 0 && ing) {
      const families = ing.tags.filter((t) => FAMILY.test(t));
      let best: { id: string; unit: number } | null = null;
      for (const other of ingredients.values()) {
        if (other.id === id || other.unit !== ing.unit || other.staple || !other.tags.some((t) => families.includes(t))) continue;
        const u = bestUnitPrice(currentBook.get(other.id) ?? []);
        if (u && u < a * 0.85 && (!best || u < best.unit)) best = { id: other.id, unit: u };
      }
      if (best) alternative = { id: best.id, name: ingredients.get(best.id)!.name };
    }
    out.push({ ingredientId: id, name: ing?.name ?? id, beforeUnit: b, afterUnit: a, pct: Math.round(ratio * 100), alternative });
  }
  return out.sort((x, y) => y.pct - x.pct);
}
