/** Évolution d'un prix mois par mois (centimes par kg, L ou pièce). */
export type TrendPoint = [month: string, cents: number, observations: number];

export interface TrendSummary {
  first: TrendPoint;
  last: TrendPoint;
  /** Point de comparaison : environ 6 mois avant le dernier (ou le plus ancien). */
  base: TrendPoint;
  /** Variation en % entre `base` et `last`. */
  pct: number;
}

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a[0].localeCompare(b[0]));
  const last = sorted.at(-1)!;
  const target = monthIndex(last[0]) - 6;
  const base = [...sorted].reverse().find((p) => monthIndex(p[0]) <= target) ?? sorted[0]!;
  const pct = base[1] > 0 ? Math.round(((last[1] - base[1]) / base[1]) * 100) : 0;
  return { first: sorted[0]!, last, base, pct };
}

/** Seuil à partir duquel une hausse est signalée. */
export const HIKE_PCT = 10;

/** Libellé du mois (« nov. 2025 »). */
export function monthLabel(m: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15));
}

/* ------------------------------------------------------------------ */
/* Votre historique : prix au kg / L / pièce relevé à chaque liste     */
/* ------------------------------------------------------------------ */

export const PRICE_HISTORY_KEY = "mb:price-history";
/** magasin → ingrédient → [date AAAA-MM-JJ, centimes par kg / L / pièce][] */
export type PriceHistory = Record<string, Record<string, [string, number][]>>;

/**
 * Ajoute les prix d'une liste de courses à l'historique : un point par jour au plus,
 * et seulement si le prix a changé depuis le dernier point (historique compact).
 */
export function addSnapshot(
  history: PriceHistory,
  storeId: string,
  date: string,
  lines: readonly { ingredientId: string; unit: "g" | "ml" | "piece"; purchased: number; costCents: number; staple: boolean }[],
  maxPoints = 36,
): PriceHistory {
  const store = { ...(history[storeId] ?? {}) };
  for (const l of lines) {
    if (l.staple || l.purchased <= 0 || l.costCents <= 0) continue;
    const per = l.unit === "piece" ? 1 : 1000;
    const cents = Math.round((l.costCents / l.purchased) * per);
    const pts = [...(store[l.ingredientId] ?? [])];
    const last = pts.at(-1);
    if (last && last[0] === date) pts[pts.length - 1] = [date, cents];
    else if (!last || last[1] !== cents) pts.push([date, cents]);
    store[l.ingredientId] = pts.slice(-maxPoints);
  }
  return { ...history, [storeId]: store };
}

/** Historique personnel ramené au mois (dernier prix connu de chaque mois), au format des tendances. */
export function monthlyFromHistory(points: readonly [string, number][]): TrendPoint[] {
  const byMonth = new Map<string, number>();
  for (const [d, c] of [...points].sort((a, b) => a[0].localeCompare(b[0]))) byMonth.set(d.slice(0, 7), c);
  return [...byMonth.entries()].map(([m, c]) => [m, c, 1]);
}

/** Tendance du marché jugée fiable : au moins 4 mois et 6 relevés. */
export function isReliableTrend(points: readonly TrendPoint[]): boolean {
  return points.length >= 4 && points.reduce((a, p) => a + p[2], 0) >= 6;
}

export function recordPriceSnapshot(storeId: string, lines: Parameters<typeof addSnapshot>[3], date = new Date().toISOString().slice(0, 10)) {
  try {
    const cur = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) ?? "{}") as PriceHistory;
    localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(addSnapshot(cur, storeId, date, lines)));
  } catch {
    /* stockage indisponible */
  }
}
