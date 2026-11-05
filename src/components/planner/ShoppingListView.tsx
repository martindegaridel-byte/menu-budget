"use client";
import { useState } from "react";
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
  const [status, setStatus] = useState<string | null>(null);
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
      setStatus("Copie impossible : sélectionnez le texte manuellement.");
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
        <div>
          <p className="text-sm text-stone-600 dark:text-stone-400">Total des courses</p>
          <p className="text-2xl font-bold tabular-nums">{formatEuros(list.totalCents)}</p>
          {checked.size > 0 && <p className="text-sm text-stone-600 dark:text-stone-400">Reste à mettre au panier : {formatEuros(remaining)}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copy}>
            Copier
          </Button>
          <Button onClick={share}>Partager</Button>
        </div>
      </Card>
      <p role="status" aria-live="polite" className="text-sm text-emerald-800 dark:text-emerald-300">
        {status}
      </p>

      {groupByAisle(toBuy).map((g) => (
        <Card key={g.aisle} aria-labelledby={`aisle-${g.aisle}`}>
          <h3 id={`aisle-${g.aisle}`} className="mb-2 font-semibold">
            {g.label}
          </h3>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {g.lines.map((l) => {
              const on = checked.has(l.ingredientId);
              return (
                <li key={l.ingredientId}>
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(l.ingredientId)} className="mt-1 size-5 shrink-0 accent-emerald-700" />
                    <span className={cx("flex-1", on && "text-stone-400 line-through")}>
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-sm text-stone-600 dark:text-stone-400">
                        {describePicks(l)} · besoin {formatQuantity(l.toBuy, l.unit)}
                        {l.fromPantry > 0 && ` (+ ${formatQuantity(l.fromPantry, l.unit)} du placard)`}
                        {l.leftover > 0 && ` · reste ${formatQuantity(l.leftover, l.unit)}`}
                      </span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums font-medium">{formatEuros(l.costCents)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {atHome.length > 0 && (
        <Card aria-labelledby="at-home">
          <h3 id="at-home" className="mb-2 font-semibold">
            Déjà dans votre placard
          </h3>
          <ul className="space-y-1 text-sm">
            {atHome.map((l) => (
              <li key={l.ingredientId} className="flex justify-between gap-2">
                <span>{l.name}</span>
                <span className="text-stone-600 dark:text-stone-400">{formatQuantity(l.needed, l.unit)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <h3 className="font-semibold">Après les courses</h3>
        <p className="text-sm text-stone-600 dark:text-stone-400">
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
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            J&apos;ai fait mes courses
          </Button>
        )}
      </Card>
      {list.unavailable.length > 0 && <Notice level="error">Certains ingrédients sont introuvables dans ce magasin.</Notice>}
    </div>
  );
}
