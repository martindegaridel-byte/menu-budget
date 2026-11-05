"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ListChecks, Pencil, RefreshCw, Star, UtensilsCrossed } from "lucide-react";
import { useToast } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { expiryInfo, todayIso } from "@/lib/client/expiry";
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

  // Anti-gaspi : produits du placard qui périment dans les 5 jours (le moteur les utilise en priorité).
  const [expiring, setExpiring] = useState<string[]>([]);
  useEffect(() => {
    api
      .getPantry()
      .then(({ items }) => {
        const today = todayIso();
        setExpiring(items.filter((i) => i.expiresOn && expiryInfo(i.expiresOn, today).tone !== "neutral").map((i) => ingredientMap.get(i.ingredientId)?.name ?? i.ingredientId));
      })
      .catch(() => setExpiring([]));
  }, [ingredientMap]);

  return (
    <div className="space-y-4">
      {showForm ? (
        <>
          <header className="space-y-1.5">
            <h1 className="text-title-1 font-semibold tracking-tight">Vos repas sur mesure</h1>
            <p className="text-body-sm text-muted">Un budget, quelques goûts : on compose des plats dont le coût en caisse le respecte, placard compris.</p>
          </header>
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
            <div>
              <p className="text-caption font-medium uppercase tracking-wider text-subtle">Votre menu</p>
              <h1 className="text-title-1 font-semibold tracking-tight">
                {result.recipes.length} repas · {result.persons} pers.
              </h1>
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
              <div role="tablist" aria-label="Affichage" className="grid grid-cols-2 gap-1 rounded-[14px] bg-surface-2 p-1 ring-1 ring-inset ring-line">
                {(["menu", "courses"] as const).map((t) => (
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
                    {t === "menu" ? <UtensilsCrossed aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> : <ListChecks aria-hidden className="size-4" strokeWidth={ICON_STROKE} />}
                    {t === "menu" ? "Menu" : `Courses (${result.shoppingList.lines.filter((l) => l.toBuy > 0).length})`}
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
                      <Button variant="secondary" icon={RefreshCw} onClick={() => generate(prefs)} disabled={busy}>
                        Autre menu
                      </Button>
                      <Button icon={Star} onClick={save} disabled={busy}>
                        Enregistrer
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
          <p className="text-caption text-subtle">
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
