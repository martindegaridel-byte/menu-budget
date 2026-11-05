"use client";
import { Check, Clock, FileSpreadsheet, MapPin, Pencil, Plus, Search, ShieldCheck, Store as StoreIcon, Tag, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Badge, CardHeader, IconButton, useToast, type BadgeTone } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
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

const DAY = 86_400_000;
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / DAY));
const ageLabel = (d: number) => (d === 0 ? "aujourd'hui" : d < 31 ? `il y a ${d} j` : d < 365 ? `il y a ${Math.round(d / 30)} mois` : `il y a ${Math.round(d / 365)} an${d >= 730 ? "s" : ""}`);

/** Confiance dans un prix : votre prix > relevé récent > import > relevé ancien > estimation. */
function confidence(source: string, asOf: string): { tone: BadgeTone; label: string } {
  if (source === "manual") return { tone: "accent", label: "Confiance élevée" };
  if (source === "openprices") {
    const d = ageDays(asOf);
    return d <= 180 ? { tone: "accent", label: "Confiance élevée" } : d <= 450 ? { tone: "warn", label: "Confiance moyenne" } : { tone: "danger", label: "Ancien" };
  }
  if (source === "import") return { tone: "warn", label: "Confiance moyenne" };
  return { tone: "neutral", label: "Estimation" };
}

export function StoresManager({ ingredients }: { ingredients: IngredientOption[] }) {
  const [prefs, setPrefs] = usePersistentState<Preferences>("mb:prefs", DEFAULT_PREFERENCES);
  const [stores, setStores] = useState<Store[]>([]);
  const [formatIndex, setFormatIndex] = useState<Record<string, number>>({});
  const toast = useToast();
  const setMsg = (m: { level: "info" | "error"; text: string }) => toast({ title: m.text, tone: m.level === "error" ? "error" : "success" });
  const [pricesVersion, setPricesVersion] = useState(0);
  const activeId = prefs.storeId ?? stores[0]?.id;

  const reload = useCallback(async () => {
    const r = await api.listStores();
    setStores(r.stores);
    setFormatIndex(r.formatPriceIndex);
  }, []);
  useEffect(() => {
    reload().catch(() => toast({ title: "Impossible de charger les magasins.", tone: "error" }));
  }, [reload, toast]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3" aria-labelledby="stores-title">
        <CardHeader icon={StoreIcon} title={<span id="stores-title">Mes magasins</span>} description="Le magasin choisi sert au calcul de vos menus." />
        <ul className="space-y-2" role="radiogroup" aria-labelledby="stores-title">
          {stores.map((s) => {
            const on = s.id === activeId;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-field p-1.5 pl-3 ring-1 ring-inset transition-colors duration-150",
                  on ? "bg-accent-soft ring-accent/40" : "bg-surface-2 ring-line",
                )}
              >
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                  <input type="radio" name="active-store" className="peer sr-only" checked={on} onChange={() => setPrefs({ ...prefs, storeId: s.id })} />
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-items-center rounded-full ring-2 ring-inset ring-line-strong peer-checked:bg-accent-2 peer-checked:ring-accent-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                  >
                    {on && <Check className="size-3.5 text-accent-fg" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="inline-flex items-center gap-1 text-caption text-muted">
                      {s.city && (
                        <>
                          <MapPin aria-hidden className="size-3" strokeWidth={ICON_STROKE} /> {s.city} ·{" "}
                        </>
                      )}
                      indice {s.priceIndex}
                    </span>
                  </span>
                </label>
                {s.id !== "intermarche-super" && (
                  <IconButton
                    icon={Trash2}
                    label={`Supprimer ${s.name}`}
                    className="text-muted hover:bg-danger-soft hover:text-danger-text"
                    onClick={async () => {
                      await api.deleteStore(s.id);
                      if (s.id === activeId) setPrefs({ ...prefs, storeId: "intermarche-super" });
                      await reload();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <AddStoreForm
          formatIndex={formatIndex}
          onCreated={async (id) => {
            await reload();
            setPrefs({ ...prefs, storeId: id });
            setMsg({ level: "info", text: "Magasin ajouté et sélectionné." });
          }}
        />
        <p className="text-caption text-subtle">
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
      <Button variant="secondary" icon={Plus} onClick={() => setOpen(true)}>
        Ajouter un magasin
      </Button>
    );
  const effectiveIndex = index ?? formatIndex[format] ?? 100;
  return (
    <form
      className="space-y-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line"
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
          <label htmlFor={ids.chain} className="mb-2 block text-caption font-medium text-muted">
            Enseigne
          </label>
          <select id={ids.chain} className="input" value={chain} onChange={(e) => setChain(e.target.value)}>
            {CHAINS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.format} className="mb-2 block text-caption font-medium text-muted">
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
          <label htmlFor={ids.city} className="mb-2 block text-caption font-medium text-muted">
            Ville / quartier (facultatif)
          </label>
          <input id={ids.city} className="input" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label htmlFor={ids.index} className="mb-2 block text-caption font-medium text-muted">
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

  if (!data)
    return (
      <div role="status" aria-label="Chargement des prix" className="h-48 animate-pulse rounded-card bg-surface ring-1 ring-inset ring-line" />
    );

  const all = Object.values(data.prices).flat();
  const op = all.filter((p) => p.source === "openprices");
  const mine = all.filter((p) => p.source === "manual" || p.source === "import");
  const newest = op.reduce<string | null>((a, p) => (!a || p.asOf > a ? p.asOf : a), null);
  const median = op.length ? [...op].map((p) => ageDays(p.asOf)).sort((a, b) => a - b)[Math.floor(op.length / 2)]! : null;

  return (
    <Card className="space-y-4" aria-labelledby="prices-title">
      <CardHeader icon={Tag} title={<span id="prices-title">Prix — {data.store.name}</span>} description="Touchez un prix pour le corriger." />
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-field bg-surface-2 p-2.5 ring-1 ring-inset ring-line">
          <dt className="text-caption text-muted">Relevés réels</dt>
          <dd className="font-numeric text-title-3 font-semibold tabular-nums">{op.length}</dd>
        </div>
        <div className="rounded-field bg-surface-2 p-2.5 ring-1 ring-inset ring-line">
          <dt className="text-caption text-muted">Fraîcheur</dt>
          <dd className="text-body-sm font-semibold">{median === null ? "—" : ageLabel(median)}</dd>
          {newest && <dd className="text-[11px] text-subtle">dernier : {ageLabel(ageDays(newest))}</dd>}
        </div>
        <div className="rounded-field bg-surface-2 p-2.5 ring-1 ring-inset ring-line">
          <dt className="text-caption text-muted">Vos prix</dt>
          <dd className="font-numeric text-title-3 font-semibold tabular-nums">{mine.length}</dd>
        </div>
      </dl>
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Rechercher un produit
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" strokeWidth={ICON_STROKE} />
        <input id={searchId} type="search" className="input pl-9" placeholder="Rechercher un produit : riz, lait, poulet…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {query.trim().length < 2 && <p className="text-caption text-subtle">Tapez au moins 2 lettres pour voir et corriger les prix d&apos;un produit.</p>}
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

      <details className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-field font-medium [&::-webkit-details-marker]:hidden">
          <FileSpreadsheet aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />
          Importer des prix (CSV)
        </summary>
        <p className="mt-2 text-body-sm text-muted">
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
            <p key={e.line} className="text-danger-text">
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
  const [quick, setQuick] = useState<{ id: string; priceCents: number } | null>(null);
  const toast = useToast();
  const qtyId = useId();
  const priceId = useId();
  const labelId = useId();
  return (
    <li className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{ingredient.name}</span>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body-sm text-muted">
          <input
            type="checkbox"
            className="size-5 accent-[var(--mb-danger)]"
            checked={unavailable}
            onChange={async (e) => {
              await api.setUnavailable(storeId, ingredient.id, e.target.checked);
              await onChanged();
            }}
          />
          Introuvable ici
        </label>
      </div>
      <ul className="mt-1 divide-y divide-line">
        {packages.map((p) => {
          const conf = confidence(p.source, p.asOf);
          const isQuick = quick?.id === p.id;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm">
                  {p.label} <span className="text-subtle">({formatQuantity(p.quantity, ingredient.unit)})</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={conf.tone} icon={ShieldCheck}>
                    {SOURCE[p.source] ?? p.source}
                  </Badge>
                  {p.source !== "estimate" && (
                    <Badge icon={Clock}>
                      <span className="sr-only">Relevé </span>
                      {ageLabel(ageDays(p.asOf))}
                    </Badge>
                  )}
                  <span className="sr-only">{conf.label}</span>
                </div>
              </div>
              {isQuick ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await api.setPrice({ storeId, ingredientId: ingredient.id, label: p.label, quantity: p.quantity, priceCents: quick.priceCents });
                    setQuick(null);
                    toast({ title: `Prix corrigé : ${formatEuros(quick.priceCents)}`, tone: "success" });
                    await onChanged();
                  }}
                >
                  <div className="w-28">
                    <label className="sr-only" htmlFor={`quick-${p.id}`}>
                      Nouveau prix pour {p.label}
                    </label>
                    <BudgetInput id={`quick-${p.id}`} value={quick.priceCents} onChange={(priceCents) => setQuick({ id: p.id, priceCents })} />
                  </div>
                  <IconButton icon={Check} label="Enregistrer le prix" type="submit" variant="primary" />
                  <IconButton icon={X} label="Annuler" onClick={() => setQuick(null)} />
                </form>
              ) : (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuick({ id: p.id, priceCents: p.priceCents })}
                    aria-label={`Corriger le prix de ${p.label} : ${formatEuros(p.priceCents)}`}
                    className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-field px-2.5 font-numeric font-semibold tabular-nums hover:bg-surface-3"
                  >
                    {formatEuros(p.priceCents)}
                    <Pencil aria-hidden className="size-3.5 text-subtle" strokeWidth={ICON_STROKE} />
                  </button>
                  {p.source !== "estimate" && (
                    <IconButton
                      icon={Trash2}
                      label={`Supprimer mon prix pour ${p.label}`}
                      className="text-muted hover:bg-danger-soft hover:text-danger-text"
                      onClick={async () => {
                        await api.deletePrice(p.id);
                        await onChanged();
                      }}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
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
            <label htmlFor={labelId} className="mb-1 block text-caption text-muted">
              Libellé
            </label>
            <input id={labelId} className="input" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
          </div>
          <div>
            <label htmlFor={qtyId} className="mb-1 block text-caption text-muted">
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
            <label htmlFor={priceId} className="mb-1 block text-caption text-muted">
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
          icon={Plus}
          className="mt-1"
          onClick={() => setEditing({ label: "", quantity: ingredient.unit === "piece" ? 1 : 500, priceCents: 100 })}
        >
          Ajouter un format
        </Button>
      )}
    </li>
  );
}
