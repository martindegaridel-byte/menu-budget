"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { AISLES, type PantryItem } from "@/lib/domain/schemas";

const UNIT_LABEL = { g: "g", ml: "ml", piece: "pièce(s)" } as const;
const QUICK_ADD = ["riz-long", "spaghetti", "penne", "oeuf", "farine-ble", "lentilles-vertes", "tomates-concassees", "oignon-jaune", "ail", "pomme-de-terre"];

function daysUntil(iso: string) {
  return Math.round((Date.parse(iso) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
}

export function PantryEditor({ ingredients }: { ingredients: IngredientOption[] }) {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ level: "info" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const byName = useMemo(() => new Map(ingredients.map((i) => [i.name.toLowerCase(), i])), [ingredients]);

  useEffect(() => {
    api
      .getPantry()
      .then((r) => setItems(r.items))
      .catch(() => setStatus({ level: "error", text: "Impossible de charger le placard." }));
  }, []);

  if (!items) return <p role="status">Chargement du placard…</p>;

  const has = new Map(items.map((i) => [i.ingredientId, i]));
  const update = (next: PantryItem[]) => {
    setItems(next);
    setDirty(true);
    setStatus(null);
  };
  const setItem = (id: string, patch: Partial<PantryItem> | null) => {
    if (patch === null) return update(items.filter((i) => i.ingredientId !== id));
    const cur = has.get(id) ?? { ingredientId: id, quantity: null };
    update([...items.filter((i) => i.ingredientId !== id), { ...cur, ...patch }]);
  };
  const addByName = () => {
    const ing = byName.get(query.trim().toLowerCase());
    if (!ing) return setStatus({ level: "error", text: "Ingrédient introuvable dans la liste." });
    if (!has.has(ing.id)) setItem(ing.id, { quantity: ing.staple ? null : ing.unit === "piece" ? 1 : 500 });
    setQuery("");
  };
  const save = async () => {
    try {
      const r = await api.putPantry(items);
      setItems(r.items);
      setDirty(false);
      setStatus({ level: "info", text: "Placard enregistré. Il sera utilisé pour vos prochains menus." });
    } catch (e) {
      setStatus({ level: "error", text: e instanceof Error ? e.message : "Erreur d'enregistrement." });
    }
  };

  const staples = ingredients.filter((i) => i.staple);
  const stock = items
    .filter((i) => !byId.get(i.ingredientId)?.staple)
    .sort((a, b) => (byId.get(a.ingredientId)?.name ?? "").localeCompare(byId.get(b.ingredientId)?.name ?? "", "fr"));

  return (
    <div className="space-y-4">
      <Card className="space-y-3" aria-labelledby="stock-title">
        <h2 id="stock-title" className="text-lg font-semibold">
          Ingrédients en stock
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Indiquez les quantités : le moteur les utilise en priorité et n&apos;achète que le complément. Une date de péremption proche favorise les recettes qui les utilisent.
        </p>
        <div className="flex gap-2">
          <label htmlFor={searchId} className="sr-only">
            Ajouter un ingrédient
          </label>
          <input
            id={searchId}
            list={`${searchId}-list`}
            className="input flex-1"
            placeholder="Ajouter un ingrédient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addByName())}
          />
          <datalist id={`${searchId}-list`}>
            {ingredients.filter((i) => !i.staple).map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <Button variant="secondary" onClick={addByName}>
            Ajouter
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ajout rapide">
          {QUICK_ADD.filter((id) => byId.has(id) && !has.has(id)).map((id) => (
            <Button key={id} size="sm" variant="secondary" onClick={() => setItem(id, { quantity: byId.get(id)!.unit === "piece" ? 6 : 500 })}>
              + {byId.get(id)!.name}
            </Button>
          ))}
        </div>
        {stock.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">Aucun ingrédient pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {stock.map((item) => {
              const ing = byId.get(item.ingredientId);
              if (!ing) return null;
              const days = item.expiresOn ? daysUntil(item.expiresOn) : null;
              return (
                <li key={item.ingredientId} className="space-y-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {ing.name}
                      <span className="ml-2 text-xs font-normal text-stone-500">{AISLES[ing.aisle]}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setItem(item.ingredientId, null)} aria-label={`Retirer ${ing.name}`}>
                      Retirer
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                      <span className="mb-1 block">Quantité ({UNIT_LABEL[ing.unit]})</span>
                      <input
                        type="number"
                        min={0}
                        step={ing.unit === "piece" ? 1 : 10}
                        className="input w-32"
                        value={item.quantity ?? ""}
                        placeholder="suffisant"
                        onChange={(e) => setItem(item.ingredientId, { quantity: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block">À consommer avant</span>
                      <input
                        type="date"
                        className="input w-44"
                        value={item.expiresOn ?? ""}
                        onChange={(e) => setItem(item.ingredientId, { expiresOn: e.target.value || undefined })}
                      />
                    </label>
                    {days !== null && days <= 5 && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        {days < 0 ? "Périmé" : days === 0 ? "Aujourd'hui" : `Dans ${days} j`} — prioritaire
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3" aria-labelledby="staples-title">
        <h2 id="staples-title" className="text-lg font-semibold">
          Condiments, huiles et épices
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">Cochez ce que vous avez déjà : ils ne seront pas comptés dans le budget.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => update([...items.filter((i) => !byId.get(i.ingredientId)?.staple), ...staples.map((s) => ({ ingredientId: s.id, quantity: null }))])}>
            Tout cocher
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update(items.filter((i) => !byId.get(i.ingredientId)?.staple))}>
            Tout décocher
          </Button>
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {staples.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-stone-50 dark:hover:bg-stone-800">
                <input
                  type="checkbox"
                  className="size-5 accent-emerald-700"
                  checked={has.has(s.id)}
                  onChange={(e) => setItem(s.id, e.target.checked ? { quantity: null } : null)}
                />
                {s.name}
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <div className="sticky bottom-20 z-10">
        <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={!dirty}>
          {dirty ? "Enregistrer le placard" : "Placard à jour"}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {status && <Notice level={status.level}>{status.text}</Notice>}
      </div>
    </div>
  );
}
