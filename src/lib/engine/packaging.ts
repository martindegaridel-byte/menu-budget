import type { Package } from "@/lib/domain/schemas";
import type { Cents } from "./money";

const EPS = 1e-9;
/** Au-delà, l'énumération exacte devient inutile : on bascule sur une heuristique. */
const MAX_COMBINATIONS = 20_000;

export interface Cover {
  counts: number[]; // aligné sur `packages`
  costCents: Cents;
  quantity: number;
}

/**
 * Combinaison de conditionnements la moins chère couvrant au moins `need`
 * (on achète des paquets entiers). Petit problème de « sac à dos de couverture »
 * résolu exactement par énumération bornée (2–4 formats par produit en pratique).
 * À coût égal, on préfère le moins de surplus, puis le moins de paquets.
 */
export function cheapestCover(need: number, packages: readonly Package[]): Cover | null {
  const pkgs = packages.filter((p) => p.quantity > 0);
  if (pkgs.length === 0) return null;
  if (need <= EPS) return { counts: pkgs.map(() => 0), costCents: 0, quantity: 0 };

  let best: Cover | null = null;
  const better = (c: Cover) =>
    !best ||
    c.costCents < best.costCents ||
    (c.costCents === best.costCents &&
      (c.quantity < best.quantity - EPS ||
        (Math.abs(c.quantity - best.quantity) <= EPS && sum(c.counts) < sum(best.counts))));

  const space = pkgs.reduce((acc, p) => acc * (Math.ceil(need / p.quantity) + 1), 1);
  if (space > MAX_COMBINATIONS) {
    // Heuristique : meilleur prix unitaire en volume, complété au mieux.
    const sorted = [...pkgs].sort((a, b) => a.priceCents / a.quantity - b.priceCents / b.quantity);
    const main = sorted[0]!;
    const counts = pkgs.map(() => 0);
    counts[pkgs.indexOf(main)] = Math.ceil((need - EPS) / main.quantity);
    return { counts, costCents: counts[pkgs.indexOf(main)]! * main.priceCents, quantity: counts[pkgs.indexOf(main)]! * main.quantity };
  }

  const counts = pkgs.map(() => 0);
  const dfs = (i: number, remaining: number, cost: number, qty: number) => {
    if (best && cost > best.costCents) return;
    const p = pkgs[i]!;
    if (i === pkgs.length - 1) {
      const n = remaining > EPS ? Math.ceil((remaining - EPS) / p.quantity) : 0;
      counts[i] = n;
      const c = { counts: [...counts], costCents: cost + n * p.priceCents, quantity: qty + n * p.quantity };
      if (better(c)) best = c;
      counts[i] = 0;
      return;
    }
    const max = remaining > EPS ? Math.ceil((remaining - EPS) / p.quantity) : 0;
    for (let n = 0; n <= max; n++) {
      counts[i] = n;
      dfs(i + 1, remaining - n * p.quantity, cost + n * p.priceCents, qty + n * p.quantity);
    }
    counts[i] = 0;
  };
  dfs(0, need, 0, 0);
  return best;
}

/** Meilleur prix unitaire (centimes par unité de base) parmi les formats. */
export function bestUnitPrice(packages: readonly Package[]): number | null {
  let best: number | null = null;
  for (const p of packages) {
    const u = p.priceCents / p.quantity;
    if (best === null || u < best) best = u;
  }
  return best;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
