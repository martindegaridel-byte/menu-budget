"use client";
import { ArrowDownWideNarrow, ChevronRight, Clock, Heart, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import Link from "next/link";
import { DishThumb } from "@/components/DishThumb";
import { useMemo, useState } from "react";
import { Badge, Chip, EmptyState, IconButton, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import { CUISINES, PreferencesSchema, type Cuisine } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult } from "@/lib/engine/optimize";
import type { RecipeBrowseItem } from "@/lib/server/views";
import { DEFAULT_PREFERENCES } from "@/components/planner/Planner";

type Filter = "vegetarien" | "vegan" | "rapide" | "sans-gluten" | "proteine" | "batch" | "favoris" | "bien-notees" | "desserts" | "petit-dej";
const FILTERS: { id: Filter; label: string; test: (r: RecipeBrowseItem) => boolean }[] = [
  { id: "favoris", label: "Favoris", test: (r) => r.favorite },
  { id: "bien-notees", label: "Bien notées", test: (r) => (r.stars ?? 0) >= 4 },
  { id: "desserts", label: "Desserts", test: (r) => r.tags.includes("dessert") },
  { id: "petit-dej", label: "Petit-déjeuner", test: (r) => r.tags.includes("petit-dejeuner") },
  { id: "rapide", label: "Rapide", test: (r) => r.tags.includes("rapide") },
  { id: "vegetarien", label: "Végétarien", test: (r) => r.tags.includes("vegetarien") },
  { id: "vegan", label: "Vegan", test: (r) => r.tags.includes("vegan") },
  { id: "sans-gluten", label: "Sans gluten", test: (r) => r.tags.includes("sans-gluten") },
  { id: "proteine", label: "Riche en protéines", test: (r) => (r.protein ?? 0) >= 30 },
  { id: "batch", label: "Batch cooking", test: (r) => r.reheats === true && (r.fridgeDays ?? 0) >= 2 },
];
type Sort = "prix" | "temps" | "note" | "nom";
const SORTS: { id: Sort; label: string }[] = [
  { id: "prix", label: "Prix" },
  { id: "temps", label: "Temps" },
  { id: "note", label: "Note" },
  { id: "nom", label: "A → Z" },
];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Page « Recettes » : recherche, filtres, tri, favoris et ajout au menu. */
export function RecipeBrowser({ recipes: initial }: { recipes: RecipeBrowseItem[] }) {
  const [recipes, setRecipes] = useState(initial);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Set<Filter>>(new Set());
  const [cuisine, setCuisine] = useState<string>("");
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [sort, setSort] = useState<Sort>("prix");
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const toast = useToast();

  const cuisines = useMemo(() => [...new Set(recipes.map((r) => r.cuisine))].sort((a, b) => (CUISINES[a as Cuisine] ?? a).localeCompare(CUISINES[b as Cuisine] ?? b, "fr")), [recipes]);
  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return recipes
      .filter((r) => words.every((w) => norm(`${r.name} ${r.ingredientNames.join(" ")}`).includes(w)))
      .filter((r) => FILTERS.every((f) => !active.has(f.id) || f.test(r)))
      .filter((r) => !cuisine || r.cuisine === cuisine)
      .filter((r) => !maxMinutes || r.totalMinutes <= maxMinutes)
      .sort((a, b) =>
        sort === "prix"
          ? (a.portionCents ?? 1e9) - (b.portionCents ?? 1e9)
          : sort === "temps"
            ? a.totalMinutes - b.totalMinutes
            : sort === "note"
              ? (b.stars ?? 0) - (a.stars ?? 0) || Number(b.favorite) - Number(a.favorite)
              : a.name.localeCompare(b.name, "fr"),
      );
  }, [recipes, q, active, cuisine, maxMinutes, sort]);
  const nFilters = active.size + (cuisine ? 1 : 0) + (maxMinutes ? 1 : 0);

  const toggleFav = async (r: RecipeBrowseItem) => {
    setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, favorite: !r.favorite } : x)));
    try {
      await api.setFavorite(r.id, !r.favorite);
    } catch {
      setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, favorite: r.favorite } : x)));
    }
  };

  /** Ajoute la recette au menu en cours (ou crée un menu avec elle). */
  const addToMenu = async (r: RecipeBrowseItem) => {
    setAdding(r.id);
    try {
      let prefs = DEFAULT_PREFERENCES;
      let current: MenuResult | null = null;
      try {
        const p = PreferencesSchema.safeParse(JSON.parse(localStorage.getItem("mb:prefs") ?? "null"));
        if (p.success) prefs = p.data;
        current = JSON.parse(localStorage.getItem("mb:result") ?? "null") as MenuResult | null;
      } catch {
        /* pas de menu en cours */
      }
      const dinners = current?.recipes.map((x) => x.recipeId) ?? [];
      const sides = current?.extras?.map((x) => x.recipeId) ?? [];
      const ids = [...dinners.slice(0, 21), ...sides, r.id].slice(0, 50);
      const result = await api.evaluate({ ...prefs, meals: ids.length }, ids);
      try {
        localStorage.setItem("mb:result", JSON.stringify(result));
        localStorage.setItem("mb:prefs", JSON.stringify({ ...prefs, meals: ids.length }));
      } catch {
        /* stockage indisponible */
      }
      toast({ title: `${r.name} ajouté à votre menu`, description: `${ids.length} repas · ${formatEuros(result.totalCents)}. Ouvrez l'onglet Menu pour le voir.`, tone: "success" });
    } catch (e) {
      toast({ title: "Impossible d'ajouter la recette", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[calc(57px+env(safe-area-inset-top))] z-10 -mx-4 space-y-2 bg-canvas/95 px-4 py-2 backdrop-blur lg:top-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="recipe-search" className="sr-only">
              Rechercher une recette ou un ingrédient
            </label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" strokeWidth={ICON_STROKE} />
            <input id="recipe-search" type="search" className="input pl-9" placeholder="Recette ou ingrédient (ex. pois chiches)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "focus-ring relative inline-flex min-h-11 items-center gap-1.5 rounded-field px-3 text-body-sm font-medium ring-1 ring-inset",
              showFilters || nFilters ? "bg-accent-soft text-accent-text ring-accent/40" : "bg-surface-2 ring-line-strong",
            )}
          >
            <SlidersHorizontal aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            Filtres{nFilters ? ` (${nFilters})` : ""}
          </button>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [&>*]:shrink-0" role="group" aria-label="Filtres rapides">
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              className="shrink-0"
              state={active.has(f.id) ? "selected" : "neutral"}
              onClick={() => {
                const next = new Set(active);
                if (next.has(f.id)) next.delete(f.id);
                else next.add(f.id);
                setActive(next);
              }}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-card bg-surface p-4 ring-1 ring-inset ring-line sm:grid-cols-3">
          <div>
            <label htmlFor="f-cuisine" className="mb-2 block text-caption font-medium text-muted">
              Cuisine
            </label>
            <select id="f-cuisine" className="input" value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
              <option value="">Toutes</option>
              {cuisines.map((c) => (
                <option key={c} value={c}>
                  {CUISINES[c as Cuisine] ?? c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-time" className="mb-2 block text-caption font-medium text-muted">
              Temps maximum
            </label>
            <select id="f-time" className="input" value={maxMinutes} onChange={(e) => setMaxMinutes(Number(e.target.value))}>
              <option value={0}>Sans limite</option>
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="mb-2 flex items-center gap-1.5 text-caption font-medium text-muted">
              <ArrowDownWideNarrow aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Trier par
            </label>
            <select id="f-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {nFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setActive(new Set());
                setCuisine("");
                setMaxMinutes(0);
              }}
              className="focus-ring inline-flex min-h-11 items-center gap-1 justify-self-start rounded-field text-body-sm font-medium text-muted hover:text-fg sm:col-span-3"
            >
              <X aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Effacer les filtres
            </button>
          )}
        </div>
      )}

      <p className="text-caption text-subtle" aria-live="polite">
        {shown.length} recette{shown.length > 1 ? "s" : ""} · prix indicatif d&apos;une portion (part utilisée), magasin de référence
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={Search} title="Aucune recette ne correspond" description="Essayez un autre mot ou retirez un filtre." />
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-card bg-surface p-2 shadow-soft ring-1 ring-inset ring-line">
              <DishThumb recipeId={r.id} className="size-16" iconClassName="size-7" />
              <Link href={`/recettes/${r.id}`} className="focus-ring min-w-0 flex-1 rounded py-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {r.portionCents !== null && <Badge tone="accent">{formatEuros(r.portionCents)} / pers.</Badge>}
                  <Badge icon={Clock}>{r.totalMinutes} min</Badge>
                  <span className="text-caption text-muted">{CUISINES[r.cuisine as Cuisine] ?? r.cuisine}</span>
                  {r.stars && (
                    <span className="inline-flex items-center gap-0.5 text-caption font-medium text-warn-text">
                      <Star aria-hidden className="size-3.5 fill-warn text-warn" strokeWidth={ICON_STROKE} /> {r.stars}
                      <span className="sr-only"> étoiles sur 5</span>
                    </span>
                  )}
                  {r.kcal !== null && <span className="text-caption text-subtle tabular-nums">{r.kcal} kcal</span>}
                </span>
              </Link>
              <IconButton
                icon={Heart}
                label={r.favorite ? `Retirer ${r.name} des favoris` : `Ajouter ${r.name} aux favoris`}
                aria-pressed={r.favorite}
                onClick={() => void toggleFav(r)}
                className={cn(r.favorite ? "text-danger [&_svg]:fill-danger" : "text-muted")}
              />
              <IconButton icon={Plus} label={`Ajouter ${r.name} à mon menu`} variant="secondary" loading={adding === r.id} onClick={() => void addToMenu(r)} />
              <ChevronRight aria-hidden className="hidden size-4 text-subtle sm:block" strokeWidth={ICON_STROKE} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
