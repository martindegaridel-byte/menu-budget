"use client";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, LineChart, Minus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, Segmented } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { HIKE_PCT, isReliableTrend, monthLabel, monthlyFromHistory, PRICE_HISTORY_KEY, summarizeTrend, type PriceHistory, type TrendPoint } from "@/lib/client/priceTrends";
import { formatEuros } from "@/lib/engine/money";

type Trends = Record<string, Record<string, TrendPoint[]>>;

/** Petite courbe d'un prix (une série : pas de légende, le nom est à côté). Points survolables. */
function Sparkline({ points, label }: { points: readonly TrendPoint[]; label: string }) {
  const W = 112;
  const H = 32;
  const P = 4;
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v: number) => (max === min ? H / 2 : H - P - ((v - min) * (H - 2 * P)) / (max - min));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--mb-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p[0]} cx={x(i)} cy={y(p[1])} r={i === points.length - 1 ? 4 : 7} fill={i === points.length - 1 ? "var(--mb-accent)" : "transparent"} stroke={i === points.length - 1 ? "var(--mb-surface)" : "none"} strokeWidth={2}>
          <title>{`${monthLabel(p[0])} : ${formatEuros(p[1])}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Évolution des prix réels relevés (Open Prices), mois par mois, pour vos produits habituels. */
export function PriceTrends({
  trends,
  names,
  stores,
}: {
  trends: Trends;
  names: Record<string, { name: string; unit: "g" | "ml" | "piece" }>;
  stores: { id: string; name: string }[];
}) {
  const available = stores;
  const [storeId, setStoreId] = useState(available[0]?.id ?? "");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<PriceHistory>({});
  const [all, setAll] = useState(false);
  useEffect(() => {
    try {
      setCounts(JSON.parse(localStorage.getItem("mb:buy-counts") ?? "{}") as Record<string, number>);
      setHistory(JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) ?? "{}") as PriceHistory);
      const pref = (JSON.parse(localStorage.getItem("mb:prefs") ?? "{}") as { storeId?: string }).storeId;
      if (pref && available.some((s) => s.id === pref)) setStoreId(pref);
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vos prix (historique personnel) d'abord ; sinon la tendance du marché quand elle est assez fournie.
  const rows = useMemo(() => {
    const market = trends[storeId] ?? {};
    const mineByIng = history[storeId] ?? {};
    const ids = new Set([...Object.keys(market), ...Object.keys(mineByIng)]);
    return [...ids]
      .flatMap((id) => {
        const personal = monthlyFromHistory(mineByIng[id] ?? []);
        const pts = personal.length >= 2 ? personal : isReliableTrend(market[id] ?? []) ? market[id]! : null;
        const s = pts ? summarizeTrend(pts) : null;
        return s && pts && names[id] ? [{ id, pts, s, source: personal.length >= 2 ? ("vous" as const) : ("marche" as const), bought: counts[id] ?? 0, ...names[id]! }] : [];
      })
      .sort((a, b) => b.bought - a.bought || Math.abs(b.s.pct) - Math.abs(a.s.pct));
  }, [trends, history, storeId, names, counts]);

  const mine = rows.filter((r) => r.bought > 0);
  const shown = all || mine.length === 0 ? rows : mine;
  const hikes = shown.filter((r) => r.s.pct >= HIKE_PCT);
  const per = (u: string) => (u === "piece" ? "pièce" : u === "ml" ? "L" : "kg");

  return (
    <Card className="space-y-3">
      <CardHeader
        icon={LineChart}
        title="Évolution des prix"
        description="Vos prix, notés à chaque liste de courses, et la tendance du marché (relevés Open Prices). Variation sur environ 6 mois."
      />
      {available.length > 1 && (
        <Segmented label="Magasin" value={storeId} onChange={setStoreId} options={available.map((s) => ({ value: s.id, label: s.name.replace(/\s*\(.*\)$/, "") }))} />
      )}
      {hikes.length > 0 && (
        <div className="rounded-field bg-warn-soft p-3 ring-1 ring-inset ring-warn/30">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-warn-text">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Hausse de plus de {HIKE_PCT} %
          </p>
          <p className="mt-1 text-body-sm">{hikes.map((h) => `${h.name} (+${h.s.pct} %)`).join(", ")}</p>
        </div>
      )}
      {shown.length === 0 && (
        <p className="text-body-sm text-muted">
          Pas encore assez d&apos;historique pour ce magasin. Chaque liste de courses note vos prix : l&apos;évolution apparaîtra au fil des semaines.
        </p>
      )}
      <ul className="divide-y divide-line">
        {shown.slice(0, all ? 60 : 12).map((r) => {
          const Icon = r.s.pct >= 3 ? ArrowUpRight : r.s.pct <= -3 ? ArrowDownRight : Minus;
          return (
            <li key={r.id} className="py-2">
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium">{r.name}</span>
                    <span className="text-caption tabular-nums text-muted">
                      {formatEuros(r.s.last[1])} / {per(r.unit)} · {monthLabel(r.s.last[0])} · {r.source === "vous" ? "vos courses" : "marché"}
                    </span>
                  </span>
                  <Sparkline points={r.pts} label={`${r.name} : de ${formatEuros(r.pts[0]![1])} à ${formatEuros(r.s.last[1])} par ${per(r.unit)}`} />
                  <span
                    className={cn(
                      "inline-flex w-16 items-center justify-end gap-0.5 text-body-sm font-semibold tabular-nums",
                      r.s.pct >= HIKE_PCT ? "text-warn-text" : "text-fg",
                    )}
                  >
                    <Icon aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                    {r.s.pct > 0 ? "+" : ""}
                    {r.s.pct} %
                  </span>
                </summary>
                <table className="mt-2 w-full text-caption tabular-nums">
                  <caption className="sr-only">Prix mensuels de {r.name}</caption>
                  <thead>
                    <tr className="text-left text-subtle">
                      <th className="py-1 font-medium">Mois</th>
                      <th className="py-1 text-right font-medium">Prix / {per(r.unit)}</th>
                      <th className="py-1 text-right font-medium">Relevés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.pts.map((p) => (
                      <tr key={p[0]} className="border-t border-line">
                        <td className="py-1 capitalize">{monthLabel(p[0])}</td>
                        <td className="py-1 text-right">{formatEuros(p[1])}</td>
                        <td className="py-1 text-right text-muted">{p[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </li>
          );
        })}
      </ul>
      {mine.length > 0 && rows.length > mine.length && (
        <button type="button" onClick={() => setAll(!all)} className="focus-ring min-h-11 rounded text-body-sm font-medium text-accent-text">
          {all ? "Seulement mes produits habituels" : `Voir les ${rows.length} produits suivis`}
        </button>
      )}
      <p className="text-caption text-subtle">
        Touchez un produit pour voir le détail. « Marché » : médiane des prix relevés dans plusieurs magasins de l&apos;enseigne, affichée seulement quand les relevés sont assez nombreux.
      </p>
    </Card>
  );
}
