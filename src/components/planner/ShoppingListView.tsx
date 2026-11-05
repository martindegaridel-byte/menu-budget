"use client";
import { Check, Copy, PackageCheck, Share2, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { Button, Card, Notice, cx } from "@/components/ui";
import { describePicks, groupByAisle, shoppingListText } from "@/lib/client/shopping";
import { usePersistentState } from "@/lib/client/storage";
import { formatEuros } from "@/lib/engine/money";
import type { ShoppingList } from "@/lib/engine/types";
import { formatQuantity } from "@/lib/engine/units";

export function ShoppingListView({
  list,
  meals,
  persons,
  storeName,
  menuKey,
  onShoppingDone,
}: {
  list: ShoppingList;
  meals: number;
  persons: number;
  storeName?: string;
  menuKey: string;
  onShoppingDone: () => Promise<void>;
}) {
  const [checkedByMenu, setCheckedByMenu] = usePersistentState<Record<string, string[]>>("mb:checked", {});
  const checked = new Set(checkedByMenu[menuKey] ?? []);
  const toast = useToast();
  const setStatus = (title: string) => toast({ title, tone: "success" });
  const [confirm, setConfirm] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedByMenu({ [menuKey]: [...next] }); // on ne garde que le menu courant
  };

  const toBuy = list.lines.filter((l) => l.toBuy > 0);
  const atHome = list.lines.filter((l) => l.toBuy === 0);
  const remaining = toBuy.filter((l) => !checked.has(l.ingredientId)).reduce((a, l) => a + l.costCents, 0);
  const text = shoppingListText(list, { meals, persons, storeName });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Liste copiée dans le presse-papiers.");
    } catch {
      toast({ title: "Copie impossible : sélectionnez le texte manuellement.", tone: "error" });
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Liste de courses", text });
        return;
      } catch {
        /* partage annulé */
        return;
      }
    }
    await copy();
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-field bg-accent-soft text-accent-text">
            <ShoppingBasket aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
          </span>
          <div>
            <p className="text-caption text-muted">Total estimé des courses</p>
            <p className="font-numeric text-title-2 font-semibold tabular-nums">{formatEuros(list.totalCents)}</p>
            {checked.size > 0 && <p className="text-caption text-muted tabular-nums">Reste à mettre au panier : {formatEuros(remaining)}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Copy} onClick={copy}>
            Copier
          </Button>
          <Button icon={Share2} onClick={share}>
            Partager
          </Button>
        </div>
      </Card>

      {groupByAisle(toBuy).map((g) => (
        <Card key={g.aisle} aria-labelledby={`aisle-${g.aisle}`}>
          <h3 id={`aisle-${g.aisle}`} className="mb-1 flex items-center justify-between text-caption font-semibold uppercase tracking-wider text-subtle">
            {g.label}
            <span className="tabular-nums">
              {g.lines.filter((l) => checked.has(l.ingredientId)).length}/{g.lines.length}
            </span>
          </h3>
          <ul className="divide-y divide-line">
            {g.lines.map((l) => {
              const on = checked.has(l.ingredientId);
              return (
                <li key={l.ingredientId}>
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(l.ingredientId)} className="peer sr-only" />
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[8px] ring-1 ring-inset ring-line-strong transition-colors duration-150 peer-checked:bg-accent-2 peer-checked:ring-accent-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                    >
                      {on && <Check className="size-4 animate-pop text-accent-fg" strokeWidth={2.5} />}
                    </span>
                    <span className={cx("flex-1 transition-colors duration-150", on && "text-subtle line-through")}>
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-caption text-muted">
                        {describePicks(l)} · besoin {formatQuantity(l.toBuy, l.unit)}
                        {l.fromPantry > 0 && ` (+ ${formatQuantity(l.fromPantry, l.unit)} du placard)`}
                        {l.leftover > 0 && ` · reste ${formatQuantity(l.leftover, l.unit)}`}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-numeric font-medium tabular-nums">{formatEuros(l.costCents)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {atHome.length > 0 && (
        <Card aria-labelledby="at-home">
          <h3 id="at-home" className="mb-2 text-caption font-semibold uppercase tracking-wider text-subtle">
            Déjà dans votre placard
          </h3>
          <ul className="space-y-1.5 text-body-sm">
            {atHome.map((l) => (
              <li key={l.ingredientId} className="flex justify-between gap-2">
                <span>{l.name}</span>
                <span className="text-muted">{formatQuantity(l.needed, l.unit)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <h3 className="text-title-3 font-semibold">Après les courses</h3>
        <p className="text-body-sm text-muted">
          Mettez votre placard à jour : ce que le menu consomme est retiré, les restes des paquets achetés sont ajoutés.
        </p>
        {confirm ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                await onShoppingDone();
                setConfirm(false);
                setStatus("Placard mis à jour.");
              }}
            >
              Confirmer la mise à jour
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button variant="secondary" icon={PackageCheck} onClick={() => setConfirm(true)}>
            J&apos;ai fait mes courses
          </Button>
        )}
      </Card>
      {list.unavailable.length > 0 && <Notice level="error">Certains ingrédients sont introuvables dans ce magasin.</Notice>}
    </div>
  );
}
