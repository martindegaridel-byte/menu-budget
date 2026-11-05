"use client";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { BudgetInput } from "@/components/planner/PreferencesForm";
import { OpenPricesImporter } from "./OpenPricesImporter";
import { DEFAULT_PREFERENCES } from "@/components/planner/Planner";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { usePersistentState } from "@/lib/client/storage";
import type { Preferences, Store, StoreFormat } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import { formatQuantity } from "@/lib/engine/units";

const CHAINS = ["Intermarché", "E.Leclerc", "Carrefour", "Auchan", "Super U", "Lidl", "Aldi", "Monoprix", "Franprix", "Netto", "Autre"];
const FORMATS: [StoreFormat, string][] = [
  ["hyper", "Hypermarché"],
  ["super", "Supermarché"],
  ["contact", "Proximité (Contact)"],
  ["express", "Express / centre-ville"],
  ["discount", "Discount"],
  ["autre", "Autre"],
];
const SOURCE = { estimate: "Estimation", manual: "Mon prix", import: "Importé", openprices: "Relevé Open Prices" } as Record<string, string>;
type Prices = Awaited<ReturnType<typeof api.getPrices>>;

export function StoresManager({ ingredients }: { ingredients: IngredientOption[] }) {
  const [prefs, setPrefs] = usePersistentState<Preferences>("mb:prefs", DEFAULT_PREFERENCES);
  const [stores, setStores] = useState<Store[]>([]);
  const [formatIndex, setFormatIndex] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ level: "info" | "error"; text: string } | null>(null);
  const [pricesVersion, setPricesVersion] = useState(0);
  const activeId = prefs.storeId ?? stores[0]?.id;

  const reload = useCallback(async () => {
    const r = await api.listStores();
    setStores(r.stores);
    setFormatIndex(r.formatPriceIndex);
  }, []);
  useEffect(() => {
    reload().catch(() => setMsg({ level: "error", text: "Impossible de charger les magasins." }));
  }, [reload]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3" aria-labelledby="stores-title">
        <h2 id="stores-title" className="text-lg font-semibold">
          Mes magasins
        </h2>
        <ul className="space-y-2">
          {stores.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 ring-1 ring-stone-200 dark:ring-stone-700">
              <label className="flex min-h-11 flex-1 items-center gap-3">
                <input
                  type="radio"
                  name="active-store"
                  className="size-5 accent-emerald-700"
                  checked={s.id === activeId}
                  onChange={() => setPrefs({ ...prefs, storeId: s.id })}
                />
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="text-xs text-stone-600 dark:text-stone-400">
                    {s.city ? `${s.city} · ` : ""}indice de prix {s.priceIndex}
                  </span>
                </span>
              </label>
              {s.id !== "intermarche-super" && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await api.deleteStore(s.id);
                    if (s.id === activeId) setPrefs({ ...prefs, storeId: "intermarche-super" });
                    await reload();
                  }}
                  aria-label={`Supprimer ${s.name}`}
                >
                  Supprimer
                </Button>
              )}
            </li>
          ))}
        </ul>
        <AddStoreForm
          formatIndex={formatIndex}
          onCreated={async (id) => {
            await reload();
            setPrefs({ ...prefs, storeId: id });
            setMsg({ level: "info", text: "Magasin ajouté et sélectionné." });
          }}
        />
        <p className="text-xs text-stone-600 dark:text-stone-400">
          Les prix de départ sont des estimations Intermarché ajustées par l&apos;indice du magasin (100 = identique). Vos prix saisis sont toujours prioritaires.
        </p>
      </Card>

      {activeId && (
        <OpenPricesImporter
          key={`op-${activeId}`}
          storeId={activeId}
          storeName={stores.find((s) => s.id === activeId)?.name ?? "ce magasin"}
          onImported={() => setPricesVersion((v) => v + 1)}
        />
      )}
      {activeId && <PricesEditor key={`${activeId}-${pricesVersion}`} storeId={activeId} ingredients={ingredients} />}
      <div role="status" aria-live="polite">
        {msg && <Notice level={msg.level}>{msg.text}</Notice>}
      </div>
    </div>
  );
}

function AddStoreForm({ formatIndex, onCreated }: { formatIndex: Record<string, number>; onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState("Intermarché");
  const [format, setFormat] = useState<StoreFormat>("super");
  const [city, setCity] = useState("");
  const [index, setIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = { chain: useId(), format: useId(), city: useId(), index: useId() };
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Ajouter un magasin
      </Button>
    );
  const effectiveIndex = index ?? formatIndex[format] ?? 100;
  return (
    <form
      className="space-y-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const label = FORMATS.find(([f]) => f === format)?.[1] ?? "";
          const { id } = await api.createStore({
            name: `${chain} ${chain === "Intermarché" ? label.split(" ")[0] : ""}${city ? ` — ${city}` : ""}`.replace(/\s+/g, " ").trim(),
            chain: chain.toLowerCase(),
            format,
            city: city || undefined,
            priceIndex: effectiveIndex,
          });
          setOpen(false);
          await onCreated(id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur");
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.chain} className="mb-1 block text-sm font-medium">
            Enseigne
          </label>
          <select id={ids.chain} className="input" value={chain} onChange={(e) => setChain(e.target.value)}>
            {CHAINS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.format} className="mb-1 block text-sm font-medium">
            Format
          </label>
          <select id={ids.format} className="input" value={format} onChange={(e) => (setFormat(e.target.value as StoreFormat), setIndex(null))}>
            {FORMATS.map(([f, l]) => (
              <option key={f} value={f}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.city} className="mb-1 block text-sm font-medium">
            Ville / quartier (facultatif)
          </label>
          <input id={ids.city} className="input" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label htmlFor={ids.index} className="mb-1 block text-sm font-medium">
            Indice de prix (100 = Intermarché Super)
          </label>
          <input
            id={ids.index}
            type="number"
            min={50}
            max={200}
            className="input"
            value={effectiveIndex}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
        </div>
      </div>
      {error && <Notice level="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit">Ajouter</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function PricesEditor({ storeId, ingredients }: { storeId: string; ingredients: IngredientOption[] }) {
  const [data, setData] = useState<Prices | null>(null);
  const [query, setQuery] = useState("");
  const [csv, setCsv] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ line: number; message: string }[]>([]);
  const searchId = useId();
  const csvId = useId();

  const reload = useCallback(async () => setData(await api.getPrices(storeId)), [storeId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length < 2 ? [] : ingredients.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query, ingredients]);

  if (!data) return <p role="status">Chargement des prix…</p>;

  return (
    <Card className="space-y-4" aria-labelledby="prices-title">
      <h2 id="prices-title" className="text-lg font-semibold">
        Prix — {data.store.name}
      </h2>
      <div>
        <label htmlFor={searchId} className="mb-1 block text-sm font-medium">
          Rechercher un produit
        </label>
        <input id={searchId} className="input" placeholder="ex. riz, lait, poulet…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="space-y-3">
        {shown.map((ing) => (
          <IngredientPrices
            key={ing.id}
            ingredient={ing}
            storeId={storeId}
            packages={data.prices[ing.id] ?? []}
            unavailable={data.unavailable.includes(ing.id)}
            onChanged={reload}
          />
        ))}
      </ul>

      <details className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800">
        <summary className="cursor-pointer font-medium">Importer des prix (CSV)</summary>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Une ligne par format : <code>ingrédient ; libellé ; quantité ; unité ; prix</code>, par exemple
          <code className="block">riz-long ; Paquet 1 kg ; 1 ; kg ; 1,39</code>
        </p>
        <label htmlFor={csvId} className="sr-only">
          Contenu CSV
        </label>
        <textarea id={csvId} className="input mt-2 min-h-32 py-2 font-mono text-sm" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Button
          className="mt-2"
          disabled={!csv.trim()}
          onClick={async () => {
            const r = await api.importPrices(storeId, csv);
            setImportMsg(`${r.imported} prix importé(s).`);
            setImportErrors(r.errors);
            await reload();
          }}
        >
          Importer
        </Button>
        <div role="status" aria-live="polite" className="mt-2 space-y-1 text-sm">
          {importMsg && <p>{importMsg}</p>}
          {importErrors.map((e) => (
            <p key={e.line} className="text-red-700 dark:text-red-400">
              Ligne {e.line} : {e.message}
            </p>
          ))}
        </div>
      </details>
    </Card>
  );
}

function IngredientPrices({
  ingredient,
  storeId,
  packages,
  unavailable,
  onChanged,
}: {
  ingredient: IngredientOption;
  storeId: string;
  packages: Prices["prices"][string];
  unavailable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<{ label: string; quantity: number; priceCents: number } | null>(null);
  const qtyId = useId();
  const priceId = useId();
  const labelId = useId();
  return (
    <li className="rounded-xl p-3 ring-1 ring-stone-200 dark:ring-stone-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{ingredient.name}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-emerald-700"
            checked={unavailable}
            onChange={async (e) => {
              await api.setUnavailable(storeId, ingredient.id, e.target.checked);
              await onChanged();
            }}
          />
          Introuvable ici
        </label>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {packages.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {p.label} <span className="text-stone-500">({formatQuantity(p.quantity, ingredient.unit)})</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-stone-100 px-2 text-xs dark:bg-stone-800">{SOURCE[p.source] ?? p.source}</span>
              <span className="font-semibold tabular-nums">{formatEuros(p.priceCents)}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ label: p.label, quantity: p.quantity, priceCents: p.priceCents })}>
                Modifier
              </Button>
              {p.source !== "estimate" && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Supprimer mon prix pour ${p.label}`}
                  onClick={async () => {
                    await api.deletePrice(p.id);
                    await onChanged();
                  }}
                >
                  ✕
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {editing ? (
        <form
          className="mt-2 grid gap-2 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.setPrice({ storeId, ingredientId: ingredient.id, ...editing });
            setEditing(null);
            await onChanged();
          }}
        >
          <div className="sm:col-span-2">
            <label htmlFor={labelId} className="text-xs">
              Libellé
            </label>
            <input id={labelId} className="input" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
          </div>
          <div>
            <label htmlFor={qtyId} className="text-xs">
              Contenance ({ingredient.unit === "piece" ? "pièces" : ingredient.unit})
            </label>
            <input
              id={qtyId}
              type="number"
              min={0.1}
              step="any"
              className="input"
              value={editing.quantity}
              onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor={priceId} className="text-xs">
              Prix
            </label>
            <BudgetInput id={priceId} value={editing.priceCents} onChange={(priceCents) => setEditing({ ...editing, priceCents })} />
          </div>
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm">
              Enregistrer mon prix
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => setEditing({ label: "", quantity: ingredient.unit === "piece" ? 1 : 500, priceCents: 100 })}
        >
          + Ajouter un format
        </Button>
      )}
    </li>
  );
}
