import type { PriceChange } from "@/lib/pricing/priceChanges";

/** Alertes de prix (dernier import Open Prices) et produits achetés souvent, gardés dans le navigateur. */
const ALERTS_KEY = "mb:price-alerts";
const COUNTS_KEY = "mb:buy-counts";
/** « Souvent » : présent dans au moins 2 listes de courses. */
export const OFTEN = 2;

export interface StoredAlerts {
  date: string;
  storeName: string;
  changes: PriceChange[];
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
};

export function savePriceAlerts(storeName: string, changes: PriceChange[]) {
  write(ALERTS_KEY, { date: new Date().toISOString(), storeName, changes } satisfies StoredAlerts);
}

export function loadPriceAlerts(): StoredAlerts | null {
  return read<StoredAlerts | null>(ALERTS_KEY, null);
}

/** Compte les ingrédients achetés (une fois par liste de courses). */
export function recordPurchases(ingredientIds: readonly string[]) {
  const counts = read<Record<string, number>>(COUNTS_KEY, {});
  for (const id of new Set(ingredientIds)) counts[id] = (counts[id] ?? 0) + 1;
  write(COUNTS_KEY, counts);
}

/** Hausses de prix sur les produits achetés souvent (les plus fortes d'abord). */
export function relevantHikes(): { alerts: PriceChange[]; date: string } | null {
  const stored = loadPriceAlerts();
  if (!stored) return null;
  const counts = read<Record<string, number>>(COUNTS_KEY, {});
  const alerts = stored.changes.filter((c) => c.pct > 0 && (counts[c.ingredientId] ?? 0) >= OFTEN);
  return alerts.length ? { alerts, date: stored.date } : null;
}
