"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarDays, ListChecks, Pencil, PiggyBank, RefreshCw, Star, Store as StoreIcon, TrendingUp, UtensilsCrossed, X } from "lucide-react";
import { useToast } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { MONTHLY_BUDGET_KEY, monthBudgetStatus } from "@/lib/client/budget";
import { recordPurchases, relevantHikes } from "@/lib/client/priceAlerts";
import { expiryInfo, todayIso } from "@/lib/client/expiry";
import { Button, Notice, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { pantryAfterCooking, pantryAfterPurchase } from "@/lib/client/shopping";
import { usePersistentState } from "@/lib/client/storage";
import type { Profile } from "@/lib/domain/profile";
import { PreferencesSchema, type Preferences, type Store } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import { AiRecipes } from "./AiRecipes";
import { BalanceCard, ExtrasCard, MenuRecipes, MenuSummary, PrepPlanCard, SwapSheet } from "./MenuView";
import { Onboarding, ONBOARDED_KEY } from "./Onboarding";
import { SubstituteSheet } from "./SubstituteSheet";
import { WeekPlanner } from "./WeekPlanner";
import { PreferencesForm } from "./PreferencesForm";
import { ShoppingListView } from "./ShoppingListView";
import { StoreCompare } from "./StoreCompare";

/** Nouvelle graine à chaque génération (gardée dans le résultat pour pouvoir le reproduire). */
const newSeed = () => Math.floor(Math.random() * 2_147_483_647);
/** Taille de l'historique transmis au moteur : les 3 derniers menus. */
const HISTORY_MENUS = 3;

/** Tirage pondéré par le rang parmi les premières options (la 1re a le plus de chances). */
function pickWeighted<T>(items: readonly T[], top = 5): T | undefined {
  const pool = items.slice(0, top);
  const weights = pool.map((_, i) => pool.length - i);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]!) < 0) return pool[i];
  return pool[0];
}

/** Noms courts des magasins proposés à tous (sélecteur du menu). */
const SHORT_STORE_NAMES: Record<string, string> = { "super-u-saint-pierre": "Super U", "intermarche-super": "Intermarché" };

export const DEFAULT_PREFERENCES: Preferences = PreferencesSchema.parse({
  budgetCents: 2000,
  meals: 5,
  persons: 1,
  maxTotalMinutes: 45,
  storeId: "super-u-saint-pierre",
});

export function Planner({
  ingredients,
  recipes,
  stores,
  llmEnabled = false,
  permanent = { excludedIngredientIds: [], allergens: [] },
}: {
  ingredients: IngredientOption[];
  recipes: RecipeSummary[];
  stores: Store[];
  llmEnabled?: boolean;
  permanent?: Profile;
}) {
  const [storedPrefs, setPrefs] = usePersistentState<Preferences>("mb:prefs", DEFAULT_PREFERENCES);
  const prefs = useMemo(() => {
    const parsed = PreferencesSchema.safeParse(storedPrefs);
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  }, [storedPrefs]);
  const [result, setResult] = usePersistentState<MenuResult | null>("mb:result", null);
  // Recettes proposées récemment (la plus récente d'abord) : le moteur évite de les reproposer.
  const [recent, setRecent] = usePersistentState<string[]>("mb:recent", []);
  const toast = useToast();
  const [tab, setTab] = useState<"menu" | "semaine" | "courses">("menu");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<{ slot: number; options: SwapOption[] | null } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const search = useSearchParams();

  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const storeName = stores.find((s) => s.id === prefs.storeId)?.name;
  const recipeIds = result?.recipes.map((r) => r.recipeId) ?? [];
  // Desserts et petits-déjeuners : envoyés après les dîners, le moteur les reconnaît à leur type.
  const extraIds = result?.extras?.map((e) => e.recipeId) ?? [];
  const allIds = [...recipeIds, ...extraIds];
  const menuKey = recipeIds.join(",") + `|${result?.persons ?? 0}`;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }, []);

  const remember = (ids: readonly string[], meals: number) =>
    setRecent((prev) => [...ids, ...prev.filter((id) => !ids.includes(id))].slice(0, Math.min(63, HISTORY_MENUS * Math.max(1, meals))));

  /** Nouveau menu (nouvelle graine, historique transmis) ; avec `initial`, réoptimise le menu courant. */
  const generate = (p: Preferences, initial?: string[]) =>
    run(async () => {
      // Nouveau menu : nouvelle graine, historique transmis, remplacements d'ingrédients remis à zéro.
      const next = initial ? { ...p, recentRecipeIds: [] } : { ...p, seed: newSeed(), recentRecipeIds: recent, substitutions: [] };
      // Le mode « fin de mois » ne vaut que pour ce menu : il n'est pas mémorisé.
      setPrefs({ ...next, recentRecipeIds: [], cheapestMode: false });
      const r = await api.generate(next, initial);
      if (!initial) remember(r.recipes.map((x) => x.recipeId), r.recipes.length);
      recordPurchases(r.shoppingList.lines.filter((l) => l.toBuy > 0).map((l) => l.ingredientId));
      setResult(r);
      setEditing(false);
      setTab("menu");
      requestAnimationFrame(() => resultRef.current?.focus());
    });

  // Raccourci de l'appli installée : /?courses=1 ouvre directement la liste de courses.
  const coursesParam = search.get("courses");
  useEffect(() => {
    if (coursesParam) setTab("courses");
  }, [coursesParam]);

  // Ouverture d'un menu de l'historique : /?menu=<id>
  const menuParam = search.get("menu");
  useEffect(() => {
    if (!menuParam) return;
    void run(async () => {
      const saved = await api.getMenu(menuParam);
      const p = PreferencesSchema.parse(saved.preferences);
      setPrefs(p);
      setResult(await api.evaluate(p, [...saved.result.recipes, ...(saved.result.extras ?? [])].map((r) => r.recipeId)));
      setEditing(false);
      window.history.replaceState(null, "", "/");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuParam]);

  // Ajustement en direct (budget / personnes) : recalcul du même menu, avec anti-rebond.
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAdjust = (p: Preferences) => {
    setPrefs(p);
    if (!result || recipeIds.length === 0) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      void run(async () => setResult(await api.evaluate({ ...p, meals: recipeIds.length }, allIds)));
    }, 350);
  };

  const openSwap = (slot: number) => {
    setSwap({ slot, options: null });
    void run(async () => {
      const { options } = await api.swap({ ...prefs, meals: recipeIds.length, recentRecipeIds: recent }, recipeIds, slot);
      setSwap({ slot, options });
    });
  };

  /** « Régénérer ce plat » : tirage d'une bonne alternative dans le budget, avec « Annuler ». */
  const regenerate = (slot: number) =>
    run(async () => {
      const before = [...recipeIds];
      const p = { ...prefs, meals: before.length, recentRecipeIds: recent };
      const { options } = await api.swap(p, before, slot);
      const fitting = options.filter((o) => o.fitsBudget);
      const fresh = fitting.filter((o) => !recent.includes(o.recipeId));
      const pick = pickWeighted(fresh.length > 0 ? fresh : fitting);
      if (!pick) {
        toast({ title: "Aucune autre recette ne tient dans le budget", tone: "warn" });
        return;
      }
      const ids = [...before];
      ids[slot] = pick.recipeId;
      setResult(await api.evaluate({ ...prefs, meals: ids.length }, [...ids, ...extraIds]));
      remember([pick.recipeId], ids.length);
      toast({
        title: `${pick.name} remplace ${result?.recipes[slot]?.name ?? "le plat"}`,
        tone: "success",
        onUndo: () => void run(async () => setResult(await api.evaluate({ ...prefs, meals: before.length }, [...before, ...extraIds]))),
      });
    });
  const pickSwap = (recipeId: string) => {
    if (!swap) return;
    const ids = [...recipeIds];
    ids[swap.slot] = recipeId;
    setSwap(null);
    void run(async () => setResult(await api.evaluate({ ...prefs, meals: ids.length }, [...ids, ...extraIds])));
  };

  /** Dessert ou petit-déjeuner compatible : régime (étiquettes dérivées) et aliments exclus. */
  const allowedExtra = (r: RecipeSummary) => {
    const excluded = new Set([...permanent.excludedIngredientIds, ...prefs.excludedIngredientIds]);
    if (r.ingredientIds.some((id) => excluded.has(id))) return false;
    if (prefs.diet === "vegan" && !r.tags.includes("vegan")) return false;
    if (prefs.diet === "vegetarien" && !r.tags.includes("vegetarien") && !r.tags.includes("vegan")) return false;
    if (prefs.allergens.includes("gluten") && !r.tags.includes("sans-gluten")) return false;
    if (prefs.allergens.includes("lait") && !r.tags.includes("sans-lactose")) return false;
    return true;
  };

  const save = () =>
    run(async () => {
      await api.saveMenu({ ...prefs, meals: recipeIds.length, recentRecipeIds: [] }, allIds);
      toast({ title: "Menu enregistré dans l'historique", tone: "success" });
    });

  const shoppingDone = async () => {
    if (!result) return;
    const { items } = await api.getPantry();
    await api.putPantry(pantryAfterPurchase(items, result.shoppingList));
    await refreshPantry();
  };

  const showForm = !result || editing;

  // Remplacer un ingrédient dans un plat (le prix du menu est recalculé, avec « Annuler »).
  const [subSlot, setSubSlot] = useState<number | null>(null);
  const applySubstitutions = (subs: Preferences["substitutions"], message: string) =>
    run(async () => {
      const before = prefs;
      const beforeTotal = result?.totalCents ?? 0;
      const next = { ...prefs, substitutions: subs };
      setPrefs(next);
      const r = await api.evaluate({ ...next, meals: recipeIds.length }, allIds);
      setResult(r);
      const delta = r.totalCents - beforeTotal;
      toast({
        title: message,
        description: delta === 0 ? "Le total ne change pas." : `Total ${delta > 0 ? "+" : "−"}${formatEuros(Math.abs(delta))} : ${formatEuros(r.totalCents)}.`,
        tone: "success",
        onUndo: () =>
          void run(async () => {
            setPrefs(before);
            setResult(await api.evaluate({ ...before, meals: recipeIds.length }, allIds));
          }),
      });
    });

  // Budget mensuel (fixé dans l'Historique) : ce qu'il reste ce mois-ci et pour la semaine.
  const [monthHint, setMonthHint] = useState<{ remainingCents: number; weeklyCents: number } | null>(null);
  useEffect(() => {
    let monthly: number | null = null;
    try {
      monthly = JSON.parse(localStorage.getItem(MONTHLY_BUDGET_KEY) ?? "null") as number | null;
    } catch {
      monthly = null;
    }
    if (!monthly) return;
    api
      .listMenus()
      .then(({ menus }) => {
        const s = monthBudgetStatus(monthly!, menus);
        setMonthHint({ remainingCents: s.remainingCents, weeklyCents: s.weeklyCents });
      })
      .catch(() => setMonthHint(null));
  }, []);

  // Alertes de prix : hausses sur les produits achetés souvent (dernier import Open Prices).
  const [hikes, setHikes] = useState<ReturnType<typeof relevantHikes>>(null);
  useEffect(() => setHikes(relevantHikes()), []);

  // Accueil en 3 étapes à la première ouverture.
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    try {
      const hasMenu = !!JSON.parse(localStorage.getItem("mb:result") ?? "null");
      if (!localStorage.getItem(ONBOARDED_KEY) && !hasMenu) setOnboarding(true);
    } catch {
      /* stockage indisponible : pas d'accueil */
    }
  }, []);

  // Allergies : une seule source de vérité (profil, onglet Exclusions). Les anciennes
  // allergies saisies dans le formulaire sont transférées une fois dans le profil.
  useEffect(() => {
    if (prefs.allergens.length === 0) return;
    void (async () => {
      try {
        const profile = await api.getProfile();
        await api.putProfile({ ...profile, allergens: [...new Set([...profile.allergens, ...prefs.allergens])] });
        setPrefs({ ...prefs, allergens: [] });
        toast({ title: "Vos allergies sont maintenant dans l'onglet Exclusions", tone: "info" });
      } catch {
        /* nouvel essai au prochain affichage */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.allergens.length]);

  // Placard : nombre d'articles (badge) et produits qui périment dans les 5 jours (anti-gaspi).
  const [expiring, setExpiring] = useState<string[]>([]);
  const [pantryCount, setPantryCount] = useState<number | null>(null);
  const refreshPantry = useCallback(async () => {
    try {
      const { items } = await api.getPantry();
      const today = todayIso();
      setPantryCount(items.length);
      setExpiring(items.filter((i) => i.expiresOn && expiryInfo(i.expiresOn, today).tone !== "neutral").map((i) => ingredientMap.get(i.ingredientId)?.name ?? i.ingredientId));
    } catch {
      setExpiring([]);
    }
  }, [ingredientMap]);
  useEffect(() => {
    void refreshPantry();
  }, [refreshPantry]);

  // « Cuisiné » : retire du placard ce que le plat a utilisé (avec « Annuler »).
  const [cookedByMenu, setCookedByMenu] = usePersistentState<Record<string, number[]>>("mb:cooked", {});
  const cooked = new Set(cookedByMenu[menuKey] ?? []);
  const markCooked = (slot: number) =>
    run(async () => {
      const r = result?.recipes[slot];
      if (!r) return;
      const { items: before } = await api.getPantry();
      if (cooked.has(slot)) {
        setCookedByMenu({ [menuKey]: [...cooked].filter((s) => s !== slot) });
        return;
      }
      const single = await api.evaluate({ ...prefs, meals: 1 }, [r.recipeId]);
      // Ce qui se compte à la pièce est entamé entier (2,5 œufs → 3 œufs).
      const used = single.shoppingList.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.unit === "piece" ? Math.ceil(l.needed - 1e-9) : l.needed }));
      await api.putPantry(pantryAfterCooking(before, used));
      setCookedByMenu({ [menuKey]: [...cooked, slot] });
      await refreshPantry();
      toast({
        title: `${r.name} : ingrédients retirés du placard`,
        tone: "success",
        onUndo: () =>
          void run(async () => {
            await api.putPantry(before);
            setCookedByMenu({ [menuKey]: [...cooked].filter((s) => s !== slot) });
            await refreshPantry();
          }),
      });
    });

  return (
    <div className="space-y-4">
      {showForm ? (
        <>
          <header className="space-y-1.5">
            <h1 className="text-title-2 font-semibold tracking-tight sm:text-title-1">Vos repas sur mesure</h1>
            <p className="text-caption text-muted sm:text-body-sm">Un budget, quelques goûts : on compose des plats dont le coût en caisse le respecte, placard compris.</p>
          </header>
          {hikes && (
            <div role="status" className="flex items-start gap-3 rounded-card bg-danger-soft p-3.5 ring-1 ring-inset ring-danger/30">
              <TrendingUp aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-text" strokeWidth={ICON_STROKE} />
              <div className="text-body-sm">
                <p className="font-semibold">Hausse de prix sur des produits que vous achetez souvent</p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {hikes.alerts.slice(0, 3).map((h) => (
                    <li key={h.ingredientId}>
                      <span className="text-fg">{h.name}</span> +{h.pct} %{h.alternative ? ` · essayez ${h.alternative.name.toLowerCase()}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setHikes(null)}
                aria-label="Masquer les alertes de prix"
                className="focus-ring -m-1 ml-auto grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg"
              >
                <X aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
              </button>
            </div>
          )}
          {expiring.length > 0 && prefs.usePantry && (
            <div role="status" className="flex items-start gap-3 rounded-card bg-warn-soft p-3.5 ring-1 ring-inset ring-warn/30">
              <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-warn-text" strokeWidth={ICON_STROKE} />
              <p className="text-body-sm">
                <span className="font-semibold">
                  {expiring.length} ingrédient{expiring.length > 1 ? "s" : ""} bientôt périmé{expiring.length > 1 ? "s" : ""}
                </span>{" "}
                ({expiring.slice(0, 3).join(", ")}
                {expiring.length > 3 ? "…" : ""}) : les recettes qui les utilisent passent en priorité.
              </p>
            </div>
          )}
          <PreferencesForm
            prefs={prefs}
            onChange={setPrefs}
            onSubmit={() => generate(prefs)}
            loading={busy}
            ingredients={ingredients}
            stores={stores}
            permanent={permanent}
            pantryCount={pantryCount}
            monthHint={monthHint}
          />
          <Button variant="secondary" icon={PiggyBank} fullWidth disabled={busy} onClick={() => generate({ ...prefs, cheapestMode: true })}>
            Mode fin de mois : le moins cher possible
          </Button>
          {llmEnabled && <AiRecipes prefs={prefs} />}
          {result && (
            <Button variant="ghost" className="w-full" onClick={() => setEditing(false)}>
              Revenir au menu actuel
            </Button>
          )}
        </>
      ) : (
        <div ref={resultRef} tabIndex={-1} className="space-y-4 outline-none" aria-busy={busy}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-caption font-medium uppercase tracking-wider text-subtle">Votre menu</p>
              <h1 className="text-title-1 font-semibold tracking-tight">
                {result.recipes.length} repas · {result.persons} pers.
              </h1>
              {stores.length > 1 && stores.length <= 4 && (
                <div role="group" aria-label="Magasin des courses" className="mt-2 flex flex-wrap gap-1.5">
                  {stores.map((st) => {
                    const on = st.id === prefs.storeId;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() => !on && liveAdjust({ ...prefs, storeId: st.id })}
                        className={cx(
                          "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-body-sm font-medium ring-1 ring-inset transition-colors duration-150",
                          on ? "bg-accent-soft text-accent-text ring-accent/40" : "text-muted ring-line hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <StoreIcon aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                        {SHORT_STORE_NAMES[st.id] ?? st.name.replace(/\s*\(.*\)$/, "")}
                      </button>
                    );
                  })}
                </div>
              )}
              {(result.lunchPortions ?? 0) > 0 && (
                <p className="text-body-sm text-muted">
                  + {result.lunchPortions} portion{result.lunchPortions > 1 ? "s" : ""} pour le midi du lendemain
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>
              Modifier les critères
            </Button>
          </div>

          <MenuSummary
            result={result}
            budgetCents={prefs.budgetCents}
            persons={prefs.persons}
            onBudget={(budgetCents) => liveAdjust({ ...prefs, budgetCents })}
            onPersons={(persons) => liveAdjust({ ...prefs, persons })}
            onReoptimize={() => generate({ ...prefs, meals: recipeIds.length }, recipeIds)}
            busy={busy}
          />

          {result.recipes.length > 0 && (
            <>
              <div role="tablist" aria-label="Affichage" className="grid grid-cols-3 gap-1 rounded-[14px] bg-surface-2 p-1 ring-1 ring-inset ring-line">
                {(["menu", "semaine", "courses"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    id={`tab-${t}`}
                    aria-selected={tab === t}
                    aria-controls={`panel-${t}`}
                    onClick={() => setTab(t)}
                    className={cx(
                      "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-field text-body-sm font-medium transition-colors duration-150",
                      tab === t ? "bg-surface-3 text-fg shadow-soft ring-1 ring-inset ring-line-strong" : "text-muted hover:text-fg",
                    )}
                  >
                    {t === "menu" ? (
                      <UtensilsCrossed aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                    ) : t === "semaine" ? (
                      <CalendarDays aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                    ) : (
                      <ListChecks aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                    )}
                    {t === "menu" ? "Menu" : t === "semaine" ? "Semaine" : `Courses (${result.shoppingList.lines.filter((l) => l.toBuy > 0).length})`}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "menu" ? (
                  <div className="space-y-3">
                    {result.prepPlan && <PrepPlanCard plan={result.prepPlan} />}
                    <MenuRecipes
                      result={result}
                      recipes={recipeMap}
                      ingredients={ingredientMap}
                      onSwap={openSwap}
                      onRegenerate={regenerate}
                      onCooked={markCooked}
                      onSubstitute={setSubSlot}
                      cooked={cooked}
                      busy={busy}
                    />
                    <ExtrasCard
                      result={result}
                      recipes={recipeMap}
                      busy={busy}
                      allowed={allowedExtra}
                      onReplace={(k, id) => {
                        const next = [...extraIds];
                        next[k] = id;
                        void run(async () => setResult(await api.evaluate({ ...prefs, meals: recipeIds.length }, [...recipeIds, ...next])));
                      }}
                    />
                    <BalanceCard result={result} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" icon={RefreshCw} onClick={() => generate(prefs)} disabled={busy}>
                        Autre menu
                      </Button>
                      <Button icon={Star} onClick={save} disabled={busy}>
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                ) : tab === "semaine" ? (
                  <WeekPlanner result={result} menuKey={menuKey} />
                ) : (
                  <div className="space-y-3">
                    <ShoppingListView
                      list={result.shoppingList}
                      meals={result.recipes.length}
                      persons={result.persons}
                      storeName={storeName}
                      menuKey={menuKey}
                      onShoppingDone={shoppingDone}
                    />
                    <StoreCompare
                      prefs={prefs}
                      recipeIds={allIds}
                      menuKey={menuKey}
                      storeCount={stores.length}
                      onPick={(storeId) => {
                        liveAdjust({ ...prefs, storeId });
                        toast({ title: `Magasin : ${stores.find((s) => s.id === storeId)?.name ?? storeId}`, tone: "success" });
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          <p className="text-caption text-subtle">
            Prix indicatifs estimés pour {storeName ?? "votre magasin"} — corrigez-les dans « Magasins » pour plus de précision.
          </p>
        </div>
      )}

      <div aria-live="assertive">{error && <Notice level="error">{error}</Notice>}</div>

      {onboarding && (
        <Onboarding
          prefs={prefs}
          stores={stores}
          ingredients={ingredients}
          permanent={permanent}
          onDone={(p) => {
            setPrefs(p);
            setOnboarding(false);
            void refreshPantry();
          }}
        />
      )}

      {subSlot !== null && result?.recipes[subSlot] && (
        <SubstituteSheet
          open
          onClose={() => setSubSlot(null)}
          recipeName={result.recipes[subSlot]!.name}
          ingredientIds={recipeMap.get(result.recipes[subSlot]!.recipeId)?.ingredientIds ?? []}
          substituted={result.recipes[subSlot]!.substituted ?? []}
          ingredients={ingredientMap}
          excluded={new Set([...permanent.excludedIngredientIds, ...prefs.excludedIngredientIds])}
          onPick={(from, to) => {
            const recipeId = result.recipes[subSlot]!.recipeId;
            applySubstitutions(
              [...prefs.substitutions.filter((s) => !(s.recipeId === recipeId && s.from === from)), { recipeId, from, to }],
              `${ingredientMap.get(from)?.name ?? from} → ${ingredientMap.get(to)?.name ?? to}`,
            );
          }}
          onReset={(from) => {
            const recipeId = result.recipes[subSlot]!.recipeId;
            setSubSlot(null);
            applySubstitutions(prefs.substitutions.filter((s) => !(s.recipeId === recipeId && s.from === from)), `${ingredientMap.get(from)?.name ?? from} rétabli`);
          }}
        />
      )}

      <SwapSheet
        open={!!swap}
        onClose={() => setSwap(null)}
        current={swap ? result?.recipes[swap.slot]?.name : undefined}
        options={swap?.options ?? null}
        loading={!!swap && !swap.options}
        onPick={pickSwap}
      />
    </div>
  );
}
