"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ds";
import { Button, Notice, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { pantryAfterShopping } from "@/lib/client/shopping";
import { usePersistentState } from "@/lib/client/storage";
import type { Profile } from "@/lib/domain/profile";
import { PreferencesSchema, type Preferences, type Store } from "@/lib/domain/schemas";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import { AiRecipes } from "./AiRecipes";
import { MenuRecipes, MenuSummary, SwapSheet } from "./MenuView";
import { PreferencesForm } from "./PreferencesForm";
import { ShoppingListView } from "./ShoppingListView";

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

export const DEFAULT_PREFERENCES: Preferences = PreferencesSchema.parse({
  budgetCents: 2000,
  meals: 5,
  persons: 1,
  maxTotalMinutes: 45,
  storeId: "intermarche-super",
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
  const [tab, setTab] = useState<"menu" | "courses">("menu");
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
      const next = initial ? { ...p, recentRecipeIds: [] } : { ...p, seed: newSeed(), recentRecipeIds: recent };
      setPrefs({ ...next, recentRecipeIds: [] });
      const r = await api.generate(next, initial);
      if (!initial) remember(r.recipes.map((x) => x.recipeId), r.recipes.length);
      setResult(r);
      setEditing(false);
      setTab("menu");
      requestAnimationFrame(() => resultRef.current?.focus());
    });

  // Ouverture d'un menu de l'historique : /?menu=<id>
  const menuParam = search.get("menu");
  useEffect(() => {
    if (!menuParam) return;
    void run(async () => {
      const saved = await api.getMenu(menuParam);
      const p = PreferencesSchema.parse(saved.preferences);
      setPrefs(p);
      setResult(await api.evaluate(p, saved.result.recipes.map((r) => r.recipeId)));
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
      void run(async () => setResult(await api.evaluate({ ...p, meals: recipeIds.length }, recipeIds)));
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
      setResult(await api.evaluate({ ...prefs, meals: ids.length }, ids));
      remember([pick.recipeId], ids.length);
      toast({
        title: `${pick.name} remplace ${result?.recipes[slot]?.name ?? "le plat"}`,
        tone: "success",
        onUndo: () => void run(async () => setResult(await api.evaluate({ ...prefs, meals: before.length }, before))),
      });
    });
  const pickSwap = (recipeId: string) => {
    if (!swap) return;
    const ids = [...recipeIds];
    ids[swap.slot] = recipeId;
    setSwap(null);
    void run(async () => setResult(await api.evaluate({ ...prefs, meals: ids.length }, ids)));
  };

  const save = () =>
    run(async () => {
      await api.saveMenu({ ...prefs, meals: recipeIds.length, recentRecipeIds: [] }, recipeIds);
      toast({ title: "Menu enregistré dans l'historique", tone: "success" });
    });

  const shoppingDone = async () => {
    if (!result) return;
    const { items } = await api.getPantry();
    await api.putPantry(pantryAfterShopping(items, result.shoppingList));
  };

  const showForm = !result || editing;

  return (
    <div className="space-y-4">
      {showForm ? (
        <>
          <h1 className="text-2xl font-bold">Vos repas sur mesure</h1>
          <p className="text-stone-600 dark:text-stone-400">
            Indiquez votre budget : nous composons des plats dont le coût en caisse le respecte, en tenant compte de votre placard.
          </p>
          <PreferencesForm
            prefs={prefs}
            onChange={setPrefs}
            onSubmit={() => generate(prefs)}
            loading={busy}
            ingredients={ingredients}
            stores={stores}
            permanent={permanent}
          />
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
            <h1 className="text-2xl font-bold">
              {result.recipes.length} repas · {result.persons} pers.
            </h1>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
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
              <div role="tablist" aria-label="Affichage" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200 p-1 dark:bg-stone-800">
                {(["menu", "courses"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    id={`tab-${t}`}
                    aria-selected={tab === t}
                    aria-controls={`panel-${t}`}
                    onClick={() => setTab(t)}
                    className={cx(
                      "min-h-10 rounded-xl text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-600",
                      tab === t ? "bg-white shadow dark:bg-stone-900" : "text-stone-700 dark:text-stone-300",
                    )}
                  >
                    {t === "menu" ? "Menu" : `Liste de courses (${result.shoppingList.lines.filter((l) => l.toBuy > 0).length})`}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === "menu" ? (
                  <div className="space-y-3">
                    <MenuRecipes
                      result={result}
                      recipes={recipeMap}
                      ingredients={ingredientMap}
                      onSwap={openSwap}
                      onRegenerate={regenerate}
                      busy={busy}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => generate(prefs)} disabled={busy}>
                        ↻ Autre proposition
                      </Button>
                      <Button onClick={save} disabled={busy}>
                        ☆ Enregistrer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ShoppingListView
                    list={result.shoppingList}
                    meals={result.recipes.length}
                    persons={result.persons}
                    storeName={storeName}
                    menuKey={menuKey}
                    onShoppingDone={shoppingDone}
                  />
                )}
              </div>
            </>
          )}
          <p className="text-xs text-stone-500">
            Prix indicatifs estimés pour {storeName ?? "votre magasin"} — corrigez-les dans « Magasins » pour plus de précision.
          </p>
        </div>
      )}

      <div aria-live="assertive">{error && <Notice level="error">{error}</Notice>}</div>

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
