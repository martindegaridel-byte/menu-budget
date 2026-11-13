import type { Package, PantryItem } from "@/lib/domain/schemas";
import { bestUnitPrice, cheapestCover, type Cover } from "./packaging";
import type { EngineContext, Needs, ShoppingLine, ShoppingList } from "./types";

const EPS = 1e-6;

/** Cache des couvertures (même besoin, mêmes formats → même résultat). */
export type CoverCache = Map<string, Cover | null>;

/** Quantité disponible au placard (Infinity si « en quantité suffisante »). */
export function pantryQuantity(item: PantryItem | undefined): number {
  if (!item) return 0;
  return item.quantity === null ? Infinity : item.quantity;
}

function cover(ingredientId: string, need: number, pkgs: readonly Package[] | undefined, cache?: CoverCache) {
  if (!pkgs) return null;
  if (!cache) return cheapestCover(need, pkgs);
  const key = `${ingredientId}|${Math.round(need * 1000)}`;
  if (cache.has(key)) return cache.get(key)!;
  const c = cheapestCover(need, pkgs);
  cache.set(key, c);
  return c;
}

/**
 * Construit la liste de courses : les besoins agrégés sont d'abord couverts par le
 * placard (une seule fois, sans double comptage), le reste est acheté en
 * conditionnements entiers au moindre coût.
 */
export function buildShoppingList(needs: Needs, ctx: EngineContext, cache?: CoverCache): ShoppingList {
  const lines: ShoppingLine[] = [];
  const unavailable: string[] = [];
  let totalCents = 0;
  let usedCostCents = 0;

  for (const [ingredientId, needed] of needs) {
    if (needed <= EPS) continue;
    const ingredient = ctx.ingredients.get(ingredientId);
    if (!ingredient) {
      unavailable.push(ingredientId);
      continue;
    }
    const fromPantry = Math.min(needed, pantryQuantity(ctx.pantry.get(ingredientId)));
    const toBuy = Math.max(0, needed - fromPantry);
    const pkgs = ctx.priceBook.get(ingredientId);

    let picks: ShoppingLine["picks"] = [];
    let costCents = 0;
    let purchased = 0;
    let used = 0;
    if (toBuy > EPS) {
      const c = cover(ingredientId, toBuy, pkgs, cache);
      if (!c || !pkgs) {
        unavailable.push(ingredientId);
        continue;
      }
      const usable = pkgs.filter((p) => p.quantity > 0);
      picks = c.counts
        .map((count, i) => ({ count, pkg: usable[i]! }))
        .filter(({ count }) => count > 0)
        .map(({ count, pkg }) => ({ packageId: pkg.id, label: pkg.label, quantity: pkg.quantity, count, unitPriceCents: pkg.priceCents }));
      costCents = c.costCents;
      purchased = c.quantity;
      used = Math.ceil(toBuy * (bestUnitPrice(usable) ?? 0));
    }

    totalCents += costCents;
    usedCostCents += used;
    lines.push({
      ingredientId,
      name: ingredient.name,
      aisle: ingredient.aisle,
      unit: ingredient.unit,
      needed,
      fromPantry,
      toBuy,
      picks,
      purchased,
      leftover: Math.max(0, purchased - toBuy),
      costCents,
      usedCostCents: used,
      staple: ingredient.staple,
    });
  }

  lines.sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name, "fr"));
  return { lines, totalCents, usedCostCents, unavailable };
}

/** Additionne des besoins. */
export function mergeNeeds(target: Needs, add: ReadonlyMap<string, number>): Needs {
  for (const [id, q] of add) target.set(id, (target.get(id) ?? 0) + q);
  return target;
}
