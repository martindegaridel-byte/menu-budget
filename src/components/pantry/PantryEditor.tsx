"use client";
import {
  ArrowDownAZ,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Minus,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ExpiryBadge,
  Segmented,
  useToast,
} from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { expiryInfo, todayIso } from "@/lib/client/expiry";
import { isPerishable } from "@/lib/domain/perishable";
import { AISLES, type Aisle, type PantryItem } from "@/lib/domain/schemas";
import { PantryIdeas } from "./PantryIdeas";
import { ReceiptImport } from "./ReceiptImport";

const UNIT_LABEL = { g: "g", ml: "ml", piece: "pièce" } as const;
const QUICK_ADD = [
  "riz-long",
  "spaghetti",
  "penne",
  "oeuf",
  "farine-ble",
  "lentilles-vertes",
  "tomates-concassees",
  "oignon-jaune",
  "ail",
  "pomme-de-terre",
];
type Sort = "peremption" | "categorie";

const stepFor = (unit: IngredientOption["unit"]) => (unit === "piece" ? 1 : 50);
const defaultQty = (ing: IngredientOption) => (ing.unit === "piece" ? 1 : 500);

export function PantryEditor({
  ingredients,
}: {
  ingredients: IngredientOption[];
}) {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("peremption");
  const [collapsed, setCollapsed] = useState<Set<Aisle>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();
  const addId = useId();
  const filterId = useId();
  const today = todayIso();
  const byId = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );
  const byName = useMemo(
    () => new Map(ingredients.map((i) => [i.name.toLowerCase(), i])),
    [ingredients],
  );

  useEffect(() => {
    api
      .getPantry()
      .then((r) => setItems(r.items))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError)
    return (
      <EmptyState
        icon={Package}
        title="Impossible de charger le placard"
        description="Vérifiez votre connexion puis rechargez la page."
      />
    );
  if (!items) return <PantrySkeleton />;

  const has = new Map(items.map((i) => [i.ingredientId, i]));
  const update = (next: PantryItem[]) => {
    setItems(next);
    setDirty(true);
  };
  const setItem = (id: string, patch: Partial<PantryItem> | null) => {
    if (patch === null)
      return update(items.filter((i) => i.ingredientId !== id));
    const cur = has.get(id) ?? { ingredientId: id, quantity: null };
    update(
      items
        .map((i) => (i.ingredientId === id ? { ...cur, ...patch } : i))
        .concat(has.has(id) ? [] : [{ ...cur, ...patch }]),
    );
  };
  const remove = (id: string) => {
    const before = items;
    update(items.filter((i) => i.ingredientId !== id));
    toast({
      title: `${byId.get(id)?.name ?? "Ingrédient"} retiré`,
      tone: "info",
      onUndo: () => update(before),
    });
  };
  const addByName = () => {
    const ing = byName.get(query.trim().toLowerCase());
    if (!ing)
      return toast({
        title: "Ingrédient introuvable dans la liste",
        tone: "warn",
      });
    if (!has.has(ing.id))
      setItem(ing.id, { quantity: ing.staple ? null : defaultQty(ing) });
    setQuery("");
  };
  const save = async () => {
    setSaving(true);
    try {
      // Pas de date de péremption pour l'épicerie sèche, les conserves, les épices, les surgelés.
      const cleaned = items.map((i) => {
        const ing = byId.get(i.ingredientId);
        return ing && !isPerishable(ing)
          ? { ingredientId: i.ingredientId, quantity: i.quantity }
          : i;
      });
      const r = await api.putPantry(cleaned);
      setItems(r.items);
      setDirty(false);
      toast({
        title: "Placard enregistré",
        description: "Il servira pour vos prochains menus.",
        tone: "success",
      });
    } catch (e) {
      toast({
        title: "Erreur d'enregistrement",
        description: e instanceof Error ? e.message : undefined,
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  /** Ajout d'achats (ticket) : on additionne aux quantités existantes. */
  const addPurchases = (bought: { ingredientId: string; quantity: number | null }[]) => {
    const next = new Map(items.map((i) => [i.ingredientId, { ...i }]));
    for (const b of bought) {
      const cur = next.get(b.ingredientId);
      if (b.quantity === null || cur?.quantity === null) next.set(b.ingredientId, { ...(cur ?? { ingredientId: b.ingredientId }), quantity: null });
      else next.set(b.ingredientId, { ...(cur ?? { ingredientId: b.ingredientId }), quantity: (cur?.quantity ?? 0) + b.quantity });
    }
    update([...next.values()]);
    toast({ title: `${bought.length} article${bought.length > 1 ? "s" : ""} ajouté${bought.length > 1 ? "s" : ""}`, description: "Pensez à enregistrer le placard.", tone: "success" });
  };

  const staples = ingredients.filter((i) => i.staple);
  const q = filter.trim().toLowerCase();
  const stock = items
    .map((item) => ({ item, ing: byId.get(item.ingredientId) }))
    .filter(
      (x): x is { item: PantryItem; ing: IngredientOption } =>
        !!x.ing && !x.ing.staple,
    )
    .filter((x) => !q || x.ing.name.toLowerCase().includes(q));
  const byExpiry = (a: (typeof stock)[number], b: (typeof stock)[number]) =>
    (a.item.expiresOn ?? "9999").localeCompare(b.item.expiresOn ?? "9999") ||
    a.ing.name.localeCompare(b.ing.name, "fr");
  const groups =
    sort === "categorie"
      ? (Object.keys(AISLES) as Aisle[])
          .map((aisle) => ({
            aisle,
            rows: stock
              .filter((x) => x.ing.aisle === aisle)
              .sort((a, b) => a.ing.name.localeCompare(b.ing.name, "fr")),
          }))
          .filter((g) => g.rows.length > 0)
      : [{ aisle: null, rows: [...stock].sort(byExpiry) }];
  const urgent = stock.filter(
    (x) =>
      x.item.expiresOn &&
      expiryInfo(x.item.expiresOn, today).tone !== "neutral",
  ).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-4" aria-labelledby="stock-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="stock-title" className="text-title-3 font-semibold">
              Ingrédients en stock
            </h2>
            <p className="mt-0.5 text-body-sm text-muted">
              Le moteur les utilise d&apos;abord et n&apos;achète que le
              complément.
            </p>
          </div>
          {urgent > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-caption font-medium text-warn-text">
              <CalendarClock
                aria-hidden
                className="size-3.5"
                strokeWidth={ICON_STROKE}
              />
              {urgent} à utiliser vite
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <label htmlFor={addId} className="sr-only">
            Ajouter un ingrédient
          </label>
          <input
            id={addId}
            list={`${addId}-list`}
            className="input flex-1"
            placeholder="Ajouter un ingrédient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addByName())
            }
          />
          <datalist id={`${addId}-list`}>
            {ingredients
              .filter((i) => !i.staple)
              .map((i) => (
                <option key={i.id} value={i.name} />
              ))}
          </datalist>
          <Button variant="secondary" icon={Plus} onClick={addByName}>
            Ajouter
          </Button>
        </div>
        {QUICK_ADD.some((id) => byId.has(id) && !has.has(id)) && (
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="Ajout rapide"
          >
            {QUICK_ADD.filter((id) => byId.has(id) && !has.has(id)).map(
              (id) => (
                <Chip
                  key={id}
                  state="neutral"
                  className="shrink-0"
                  onClick={() =>
                    setItem(id, { quantity: defaultQty(byId.get(id)!) })
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    <Plus
                      aria-hidden
                      className="size-3.5"
                      strokeWidth={ICON_STROKE}
                    />
                    {byId.get(id)!.name}
                  </span>
                </Chip>
              ),
            )}
          </div>
        )}

        {items.some((i) => !byId.get(i.ingredientId)?.staple) && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <label htmlFor={filterId} className="sr-only">
                Rechercher dans le placard
              </label>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                strokeWidth={ICON_STROKE}
              />
              <input
                id={filterId}
                type="search"
                className="input pl-9"
                placeholder="Rechercher…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <Segmented
              label="Trier par"
              value={sort}
              onChange={setSort}
              options={[
                {
                  value: "peremption",
                  label: "Péremption",
                  icon: CalendarClock,
                },
                { value: "categorie", label: "Rayon", icon: ArrowDownAZ },
              ]}
            />
          </div>
        )}

        {stock.length === 0 ? (
          q ? (
            <p className="py-6 text-center text-body-sm text-muted">
              Aucun ingrédient ne correspond à « {filter} ».
            </p>
          ) : (
            <EmptyState
              icon={Package}
              title="Votre placard est vide"
              description="Ajoutez ce que vous avez déjà : vos menus coûteront moins cher."
              className="py-6"
            />
          )
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const isCollapsed = g.aisle !== null && collapsed.has(g.aisle);
              return (
                <section
                  key={g.aisle ?? "all"}
                  aria-label={g.aisle ? AISLES[g.aisle] : "Ingrédients"}
                >
                  {g.aisle && (
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => {
                        const next = new Set(collapsed);
                        if (isCollapsed) next.delete(g.aisle!);
                        else next.add(g.aisle!);
                        setCollapsed(next);
                      }}
                      className="focus-ring mb-1 flex min-h-11 w-full items-center justify-between rounded-field px-1 text-caption font-semibold uppercase tracking-wider text-subtle hover:text-fg"
                    >
                      <span>
                        {AISLES[g.aisle]}{" "}
                        <span className="tabular-nums">· {g.rows.length}</span>
                      </span>
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-4 transition-transform duration-200",
                          isCollapsed && "-rotate-90",
                        )}
                        strokeWidth={ICON_STROKE}
                      />
                    </button>
                  )}
                  {!isCollapsed && (
                    <ul className="divide-y divide-line overflow-hidden rounded-field ring-1 ring-inset ring-line">
                      {g.rows.map(({ item, ing }) => (
                        <PantryRow
                          key={item.ingredientId}
                          item={item}
                          ing={ing}
                          today={today}
                          showAisle={sort !== "categorie"}
                          onChange={(patch) =>
                            setItem(item.ingredientId, patch)
                          }
                          onRemove={() => remove(item.ingredientId)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <p className="text-caption text-subtle">
              Astuce : sur mobile, glissez une ligne vers la gauche pour la
              retirer.
            </p>
          </div>
        )}
      </Card>

      <PantryIdeas
        stock={items
          .map((i) => ({ i, ing: byId.get(i.ingredientId) }))
          .filter((x): x is { i: PantryItem; ing: IngredientOption } => !!x.ing && !x.ing.staple)
          .map(({ i, ing }) => ({ ing, urgent: !!i.expiresOn && expiryInfo(i.expiresOn, today).tone !== "neutral" }))}
      />

      <ReceiptImport ingredients={ingredients} onAdd={addPurchases} />

      <Card className="space-y-4" aria-labelledby="staples-title">
        <div>
          <h2 id="staples-title" className="text-title-3 font-semibold">
            Condiments, huiles et épices
          </h2>
          <p className="mt-0.5 text-body-sm text-muted">
            Touchez ce que vous avez déjà : ce ne sera pas compté dans le
            budget.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip
            state="neutral"
            onClick={() =>
              update([
                ...items.filter((i) => !byId.get(i.ingredientId)?.staple),
                ...staples.map((s) => ({ ingredientId: s.id, quantity: null })),
              ])
            }
          >
            Tout cocher
          </Chip>
          <Chip
            state="neutral"
            onClick={() =>
              update(items.filter((i) => !byId.get(i.ingredientId)?.staple))
            }
          >
            Tout décocher
          </Chip>
          <span className="ml-auto self-center text-caption text-subtle tabular-nums">
            {staples.filter((s) => has.has(s.id)).length}/{staples.length}
          </span>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Condiments disponibles"
        >
          {staples.map((s) => (
            <Chip
              key={s.id}
              state={has.has(s.id) ? "selected" : "neutral"}
              onClick={() =>
                setItem(s.id, has.has(s.id) ? null : { quantity: null })
              }
            >
              {s.name}
            </Chip>
          ))}
        </div>
      </Card>

      {/* Barre d'enregistrement : seulement s'il y a des modifications, au-dessus de la navigation. */}
      {dirty && (
        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
          <div className="flex animate-toast-in items-center justify-between gap-3 rounded-card bg-glass p-2 pl-4 shadow-lift ring-1 ring-inset ring-line-strong backdrop-blur-xl">
            <span className="text-body-sm text-muted">
              Modifications non enregistrées
            </span>
            <Button icon={Save} loading={saving} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PantryRow({
  item,
  ing,
  today,
  showAisle,
  onChange,
  onRemove,
}: {
  item: PantryItem;
  ing: IngredientOption;
  today: string;
  showAisle: boolean;
  onChange: (patch: Partial<PantryItem>) => void;
  onRemove: () => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const perishable = isPerishable(ing);
  const step = stepFor(ing.unit);
  const qty = item.quantity;

  // Glisser vers la gauche (tactile) pour retirer.
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch")
      start.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    if (Math.abs(e.clientY - start.current.y) > 24 && Math.abs(ddx) < 24) {
      start.current = null;
      setDx(0);
      return;
    }
    setDx(Math.min(0, ddx));
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    if (dx < -96) onRemove();
    else setDx(0);
  };

  return (
    <li className="relative bg-danger-soft">
      <span
        aria-hidden
        className="absolute inset-y-0 right-4 flex items-center text-danger-text"
      >
        <Trash2 className="size-5" strokeWidth={ICON_STROKE} />
      </span>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={cn(
          "relative bg-surface py-1.5 pl-3 pr-1",
          !dx && "transition-transform duration-200",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{ing.name}</p>
            {showAisle && (
              <p className="truncate text-caption text-subtle">
                {AISLES[ing.aisle]}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Retirer ${ing.name}`}
            className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-subtle hover:bg-danger-soft hover:text-danger-text"
          >
            <Trash2
              aria-hidden
              className="size-[18px]"
              strokeWidth={ICON_STROKE}
            />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 pr-2">
          <div className="min-h-11">
            {perishable &&
              (editingDate ? (
                <span className="inline-flex items-center gap-1">
                  <label className="sr-only" htmlFor={`date-${ing.id}`}>
                    À consommer avant
                  </label>
                  <input
                    id={`date-${ing.id}`}
                    type="date"
                    autoFocus
                    min={today}
                    className="input h-11 w-40 py-0 text-body-sm"
                    value={item.expiresOn ?? ""}
                    onChange={(e) =>
                      onChange({ expiresOn: e.target.value || undefined })
                    }
                    onBlur={() => setEditingDate(false)}
                  />
                  {item.expiresOn && (
                    <button
                      type="button"
                      aria-label="Effacer la date"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange({ expiresOn: undefined });
                        setEditingDate(false);
                      }}
                      className="focus-ring grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2"
                    >
                      <X
                        aria-hidden
                        className="size-4"
                        strokeWidth={ICON_STROKE}
                      />
                    </button>
                  )}
                </span>
              ) : item.expiresOn ? (
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  className="focus-ring inline-flex min-h-11 items-center rounded-full"
                  aria-label={`Modifier la date de ${ing.name}`}
                >
                  <ExpiryBadge date={item.expiresOn} today={today} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-caption font-medium text-muted hover:text-fg"
                >
                  <CalendarPlus
                    aria-hidden
                    className="size-4"
                    strokeWidth={ICON_STROKE}
                  />
                  Ajouter une date
                </button>
              ))}
            {!perishable && (
              <span className="inline-flex min-h-11 items-center text-caption text-subtle">
                Se conserve
              </span>
            )}
          </div>

          <div
            className="inline-flex items-center rounded-full bg-surface-2 p-0.5 ring-1 ring-inset ring-line"
            role="group"
            aria-label={`Quantité de ${ing.name}`}
          >
            <button
              type="button"
              aria-label={`Moins de ${ing.name}`}
              disabled={qty === 0}
              onClick={() =>
                onChange({ quantity: Math.max(0, (qty ?? step) - step) })
              }
              className="focus-ring grid size-10 place-items-center rounded-full hover:bg-surface-3 disabled:opacity-35"
            >
              <Minus aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            </button>
            <label className="sr-only" htmlFor={`qty-${ing.id}`}>
              Quantité ({UNIT_LABEL[ing.unit]})
            </label>
            <input
              id={`qty-${ing.id}`}
              inputMode="numeric"
              className="w-14 bg-transparent text-center text-body-sm font-semibold tabular-nums outline-none placeholder:text-subtle focus-visible:rounded focus-visible:ring-2 focus-visible:ring-focus"
              value={qty ?? ""}
              placeholder="assez"
              onChange={(e) =>
                onChange({
                  quantity:
                    e.target.value === ""
                      ? null
                      : Math.max(
                          0,
                          Number(e.target.value.replace(",", ".")) || 0,
                        ),
                })
              }
            />
            <span aria-hidden className="pr-1 text-caption text-subtle">
              {UNIT_LABEL[ing.unit]}
            </span>
            <button
              type="button"
              aria-label={`Plus de ${ing.name}`}
              onClick={() => onChange({ quantity: (qty ?? 0) + step })}
              className="focus-ring grid size-10 place-items-center rounded-full hover:bg-surface-3"
            >
              <Plus aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function PantrySkeleton() {
  return (
    <div role="status" aria-label="Chargement du placard" className="space-y-4">
      {[0, 1].map((c) => (
        <div
          key={c}
          className="space-y-3 rounded-card bg-surface p-5 ring-1 ring-inset ring-line"
        >
          <div className="h-5 w-48 animate-pulse rounded bg-surface-2" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-field bg-surface-2"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
