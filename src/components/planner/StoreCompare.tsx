"use client";
import { Check, Scale, Store as StoreIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { Preferences } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";

type Row = Awaited<ReturnType<typeof api.compareStores>>["stores"][number];

/** Même menu, même placard : combien coûteraient les courses dans chacun de vos magasins ? */
export function StoreCompare({
  prefs,
  recipeIds,
  menuKey,
  storeCount,
  onPick,
}: {
  prefs: Preferences;
  recipeIds: string[];
  menuKey: string;
  storeCount: number;
  onPick: (storeId: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nouveau menu ou nouveau magasin : la comparaison précédente n'est plus valable.
  useEffect(() => setRows(null), [menuKey, prefs.storeId]);

  if (storeCount < 2) {
    return (
      <Card className="flex items-start gap-3">
        <Scale aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" strokeWidth={ICON_STROKE} />
        <p className="text-body-sm text-muted">
          Ajoutez un deuxième magasin (Hyper, Lidl, marché…) dans{" "}
          <Link href="/magasins" className="link">
            Magasins
          </Link>{" "}
          pour comparer le prix de ces courses.
        </p>
      </Card>
    );
  }

  const compare = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await api.compareStores({ ...prefs, meals: recipeIds.length }, recipeIds)).stores);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparaison impossible.");
    } finally {
      setLoading(false);
    }
  };

  const current = rows?.find((r) => r.storeId === prefs.storeId);
  const best = rows?.[0];
  return (
    <Card className="space-y-3" aria-labelledby="comparer-titre">
      <h2 id="comparer-titre" className="inline-flex items-center gap-2 text-body font-semibold">
        <Scale aria-hidden className="size-5 text-accent-text" strokeWidth={ICON_STROKE} /> Comparer les magasins
      </h2>
      {!rows ? (
        <>
          <p className="text-body-sm text-muted">Le même menu, avec votre placard, dans chacun de vos {storeCount} magasins.</p>
          <Button variant="secondary" icon={StoreIcon} fullWidth loading={loading} onClick={() => void compare()}>
            Comparer
          </Button>
        </>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-field ring-1 ring-inset ring-line" aria-live="polite">
          {rows.map((r) => {
            const isCurrent = r.storeId === prefs.storeId;
            const diff = current && !isCurrent ? r.totalCents - current.totalCents : 0;
            return (
              <li key={r.storeId} className={cn("flex min-h-14 items-center gap-3 px-3 py-2", isCurrent ? "bg-surface-2" : "bg-surface")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">{r.name}</p>
                  <p className="flex flex-wrap gap-1.5 text-caption text-muted">
                    {r === best && r.missing === 0 && <Badge tone="accent">Le moins cher</Badge>}
                    {isCurrent && <Badge>Magasin actuel</Badge>}
                    {r.missing > 0 && <Badge tone="warn">{r.missing} introuvable{r.missing > 1 ? "s" : ""}</Badge>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-numeric font-semibold tabular-nums">{formatEuros(r.totalCents)}</p>
                  {diff !== 0 && (
                    <p className={cn("text-caption tabular-nums", diff < 0 ? "text-accent-text" : "text-muted")}>
                      {diff < 0 ? "−" : "+"}
                      {formatEuros(Math.abs(diff))}
                    </p>
                  )}
                </div>
                {!isCurrent && (
                  <Button variant="ghost" size="sm" icon={Check} onClick={() => onPick(r.storeId)} aria-label={`Faire les courses chez ${r.name}`}>
                    Choisir
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-body-sm text-danger-text">{error}</p>}
      <p className="text-caption text-subtle">Prix relevés quand vous en avez, sinon estimations ajustées au type de magasin.</p>
    </Card>
  );
}
