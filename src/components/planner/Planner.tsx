"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Notice, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { pantryAfterShopping } from "@/lib/client/shopping";
import { usePersistentState } from "@/lib/client/storage";
import { PreferencesSchema, type Preferences, type Store } from "@/lib/domain/schemas";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import { MenuRecipes, MenuSummary, SwapSheet } from "./MenuView";
import { PreferencesForm } from "./PreferencesForm";
import { ShoppingListView } from "./ShoppingListView";

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
}: {
  ingredients: IngredientOption[];
  recipes: RecipeSummary[];
  stores: Store[];
}) {
  const [storedPrefs, setPrefs] = usePersistentState<Preferences>("mb:prefs", DEFAULT_PREFERENCES);
  const prefs = useMemo(() => {
    const parsed = PreferencesSchema.safeParse(storedPrefs);
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  }, [storedPrefs]);
  const [result, setResult] = usePersistentState<MenuResult | null>("mb:result", null);
  const [tab, setTab] = useState<"menu" | "courses">("menu");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const generate = (p: Preferences, initial?: string[]) =>
    run(async () => {
      const r = await api.generate(p, initial);
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
      const { options } = await api.swap({ ...prefs, meals: recipeIds.length }, recipeIds, slot);
      setSwap({ slot, options });
    });
  };
  const pickSwap = (recipeId: string) => {
    if (!swap) return;
    const ids = [...recipeIds];
    ids[swap.slot] = recipeId;
    setSwap(null);
    void run(async () => setResult(await api.evaluate({ ...prefs, meals: ids.length }, ids)));
  };

  const save = () =>
    run(async () => {
      await api.saveMenu({ ...prefs, meals: recipeIds.length }, recipeIds);
      setToast("Menu enregistré dans l'historique.");
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
          />
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
                    <MenuRecipes result={result} recipes={recipeMap} ingredients={ingredientMap} onSwap={openSwap} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={() => generate({ ...prefs, seed: prefs.seed + 1 })} disabled={busy}>
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
      <div role="status" aria-live="polite">
        {toast && <Notice level="info">{toast}</Notice>}
      </div>

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
