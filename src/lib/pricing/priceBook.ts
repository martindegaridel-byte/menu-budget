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
