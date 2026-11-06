"use client";
import { ArrowDown, ArrowUp, Check, ListOrdered, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { describePicks, groupByAisle } from "@/lib/client/shopping";
import { usePersistentState } from "@/lib/client/storage";
import { AISLES, type Aisle } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { ShoppingLine } from "@/lib/engine/types";

/**
 * Mode « au magasin » : plein écran, gros texte, écran maintenu allumé, articles
 * cochés en bas, rayons dans l'ordre de votre magasin (réglable).
 */
export function StoreMode({
  lines,
  checked,
  onToggle,
  onClose,
  storeName,
}: {
  lines: readonly ShoppingLine[];
  checked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
  storeName?: string;
}) {
  const [order, setOrder] = usePersistentState<Aisle[]>("mb:aisle-order", Object.keys(AISLES) as Aisle[]);
  const [reorder, setReorder] = useState(false);

  // Écran maintenu allumé pendant les courses (si le navigateur le permet).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      void lock?.release().catch(() => undefined);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const fullOrder = useMemo(() => [...order.filter((a) => a in AISLES), ...(Object.keys(AISLES) as Aisle[]).filter((a) => !order.includes(a))], [order]);
  const groups = groupByAisle(lines).sort((a, b) => fullOrder.indexOf(a.aisle) - fullOrder.indexOf(b.aisle));
  const done = lines.filter((l) => checked.has(l.ingredientId));
  const remaining = lines.filter((l) => !checked.has(l.ingredientId)).reduce((a, l) => a + l.costCents, 0);
  const move = (aisle: Aisle, delta: number) => {
    const next = [...fullOrder];
    const i = next.indexOf(aisle);
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Mode magasin" className="fixed inset-0 z-[60] flex flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <ShoppingCart aria-hidden className="size-6 text-accent-text" strokeWidth={ICON_STROKE} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{storeName ?? "Mes courses"}</p>
          <p className="text-caption text-muted tabular-nums" aria-live="polite">
            {done.length}/{lines.length} dans le panier · reste {formatEuros(remaining)}
          </p>
        </div>
        <IconButton icon={ListOrdered} label="Réordonner les rayons" aria-pressed={reorder} onClick={() => setReorder((v) => !v)} />
        <IconButton icon={X} label="Quitter le mode magasin" onClick={onClose} />
      </header>
      <div className="h-1 bg-surface-3" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${lines.length ? (done.length / lines.length) * 100 : 0}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-3">
        {reorder ? (
          <section aria-label="Ordre des rayons" className="mx-auto max-w-xl space-y-2">
            <p className="text-body-sm text-muted">Rangez les rayons dans l&apos;ordre où vous les parcourez dans votre magasin.</p>
            <ol className="space-y-1.5">
              {fullOrder.map((a, i) => (
                <li key={a} className="flex items-center gap-2 rounded-field bg-surface px-3 py-1 ring-1 ring-inset ring-line">
                  <span className="w-6 text-caption tabular-nums text-subtle">{i + 1}</span>
                  <span className="flex-1 text-body font-medium">{AISLES[a]}</span>
                  <IconButton icon={ArrowUp} label={`Monter ${AISLES[a]}`} disabled={i === 0} onClick={() => move(a, -1)} />
                  <IconButton icon={ArrowDown} label={`Descendre ${AISLES[a]}`} disabled={i === fullOrder.length - 1} onClick={() => move(a, 1)} />
                </li>
              ))}
            </ol>
            <Button fullWidth onClick={() => setReorder(false)}>
              Terminé
            </Button>
          </section>
        ) : (
          <div className="mx-auto max-w-xl space-y-5">
            {groups.map((g) => {
              const todo = g.lines.filter((l) => !checked.has(l.ingredientId));
              if (todo.length === 0) return null;
              return (
                <section key={g.aisle} aria-label={g.label}>
                  <h2 className="mb-2 text-caption font-semibold uppercase tracking-wider text-subtle">{g.label}</h2>
                  <ul className="space-y-2">
                    {todo.map((l) => (
                      <li key={l.ingredientId}>
                        <button
                          type="button"
                          onClick={() => onToggle(l.ingredientId)}
                          className="focus-ring flex min-h-16 w-full items-center gap-4 rounded-card bg-surface px-4 py-3 text-left shadow-soft ring-1 ring-inset ring-line active:scale-[0.99]"
                        >
                          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] ring-2 ring-inset ring-line-strong" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-title-3 font-semibold">{l.name}</span>
                            <span className="block text-body-sm text-muted">{describePicks(l)}</span>
                          </span>
                          <span className="text-body font-semibold tabular-nums">{formatEuros(l.costCents)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {done.length === lines.length && lines.length > 0 && (
              <p className="rounded-card bg-accent-soft p-4 text-center text-title-3 font-semibold text-accent-text">Tout est dans le panier !</p>
            )}
            {done.length > 0 && (
              <section aria-label="Dans le panier">
                <h2 className="mb-2 text-caption font-semibold uppercase tracking-wider text-subtle">Dans le panier · {done.length}</h2>
                <ul className="space-y-1.5">
                  {done.map((l) => (
                    <li key={l.ingredientId}>
                      <button
                        type="button"
                        onClick={() => onToggle(l.ingredientId)}
                        aria-label={`Retirer ${l.name} du panier`}
                        className="focus-ring flex min-h-12 w-full items-center gap-4 rounded-field px-4 text-left text-muted hover:bg-surface"
                      >
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent-2">
                          <Check className="size-5 text-accent-fg" strokeWidth={3} />
                        </span>
                        <span className={cn("flex-1 text-body line-through")}>{l.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
