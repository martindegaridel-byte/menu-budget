import type { Nutrition, Preferences } from "@/lib/domain/schemas";
import { allocateCents, divideCeil, formatEuros, type Cents } from "./money";
import { HIGH_PROTEIN_GRAMS, energyShares } from "./nutrition";
import { bestUnitPrice } from "./packaging";
import { filterRecipes, REJECTION_LABELS, type FilterResult, type PreparedRecipe, type RejectionReason } from "./recipes";
import { createRng } from "./rng";
import { buildShoppingList, mergeNeeds, type CoverCache } from "./shopping";
import type { EngineContext, Needs, ShoppingList } from "./types";

/* ------------------------------------------------------------------ */
/* Types de résultat                                                   */
/* ------------------------------------------------------------------ */

export interface MenuRecipe {
  recipeId: string;
  name: string;
  cuisine: string;
  totalMinutes: number;
  difficulty: number;
  /** Part du total en caisse attribuée à ce plat (la somme = total exact). */
  allocatedCents: Cents;
  perPersonCents: Cents;
  /** Coût en caisse si ce plat était cuisiné seul. */
  standaloneCents: Cents;
  droppedOptional: string[];
  /** Ingrédients facultatifs non retenus pour tenir le budget. */
  skippedOptional: string[];
  /** Ingrédients pris (au moins en partie) dans le placard. */
  pantryIngredientIds: string[];
  /** Valeurs nutritionnelles d'une portion (estimation). */
  nutrition: Nutrition | null;
}

export interface Diagnostic {
  level: "info" | "warning" | "error";
  code:
    | "no-candidates"
    | "over-budget"
    | "fewer-recipes-than-meals"
    | "pantry-savings"
    | "suggest-meals"
    | "suggest-persons"
    | "recipe-no-longer-valid"
    | "unavailable"
    | "nutrition-goal";
  message: string;
}

export type MenuStatus = "ok" | "over-budget" | "no-candidates";

export interface MenuResult {
  status: MenuStatus;
  persons: number;
  meals: number;
  budgetCents: Cents;
  totalCents: Cents;
  remainingCents: Cents;
  perPersonPerMealCents: Cents;
  pantrySavingsCents: Cents;
  /** Moyenne par repas et par personne (null si inconnue). */
  nutritionPerMeal: Nutrition | null;
  recipes: MenuRecipe[];
  shoppingList: ShoppingList;
  diagnostics: Diagnostic[];
  /** Graine utilisée : la même graine et les mêmes réglages redonnent le même menu. */
  seed: number;
  stats: { candidates: number; evaluations: number; elapsedMs: number };
}

export interface OptimizeOptions {
  /** Temps maximal de recherche locale (ms). */
  timeLimitMs?: number;
  /** Menu de départ (ids de recettes), ex. menu courant après changement de budget. */
  initial?: readonly string[];
  /** Calculer les suggestions (repas / personnes) si le budget est impossible. */
  withSuggestions?: boolean;
}

/* ------------------------------------------------------------------ */
/* Évaluateur (mémoïsé)                                                */
/* ------------------------------------------------------------------ */

interface Evaluation {
  cost: Cents;
  feasible: boolean; // tous les ingrédients sont trouvables
  objective: number;
}

/** Pénalités de variété : chaque répétition coûte un peu, le dépassement du plafond beaucoup. */
const REPEAT_PENALTY = { cuisine: 1.5, protein: 1.5, base: 1.5 } as const;
const OVER_CAP_PENALTY = 6;
const DUPLICATE_PENALTY = 8;
/**
 * Poids du coût dans l'objectif : faible, pour départager sans ramener toujours les
 * mêmes plats bon marché (le budget, lui, reste une contrainte stricte).
 */
const COST_WEIGHT = 0.5;
/** Écart toléré avec le meilleur menu trouvé pour le tirage final (3 %, au moins 1 point). */
const NEAR_BEST = 0.03;

/** Nombre maximal de plats sur la même base ou la même protéine : environ un tiers du menu. */
export function varietyCap(meals: number): number {
  return Math.max(1, Math.ceil(meals / 3));
}

class Evaluator {
  evaluations = 0;
  private memo = new Map<string, Evaluation>();
  readonly coverCache: CoverCache = new Map();

  constructor(
    readonly candidates: readonly PreparedRecipe[],
    readonly ctx: EngineContext,
    readonly budget: Cents,
    readonly meals: number,
  ) {}

  needs(menu: readonly number[]): Needs {
    const n: Needs = new Map();
    for (const i of menu) mergeNeeds(n, this.candidates[i]!.needs);
    return n;
  }

  evaluate(menu: readonly number[]): Evaluation {
    const key = [...menu].sort((a, b) => a - b).join(",");
    const hit = this.memo.get(key);
    if (hit) return hit;
    this.evaluations++;
    const list = buildShoppingList(this.needs(menu), this.ctx, this.coverCache);
    const ev: Evaluation = {
      cost: list.totalCents,
      feasible: list.unavailable.length === 0,
      objective: this.menuScore(menu) - (COST_WEIGHT * this.meals * list.totalCents) / Math.max(this.budget, 100),
    };
    this.memo.set(key, ev);
    return ev;
  }

  private menuScore(menu: readonly number[]): number {
    let score = 0;
    const count = { cuisine: new Map<string, number>(), protein: new Map<string, number>(), base: new Map<string, number>() };
    const bump = (m: Map<string, number>, k: string | null) => k && m.set(k, (m.get(k) ?? 0) + 1);
    const seen = new Map<number, number>();
    for (const i of menu) {
      const c = this.candidates[i]!;
      score += c.score;
      bump(count.cuisine, c.recipe.cuisine);
      bump(count.protein, c.protein);
      bump(count.base, c.base);
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
    const cap = varietyCap(menu.length);
    for (const kind of ["cuisine", "protein", "base"] as const) {
      for (const n of count[kind].values()) {
        score -= REPEAT_PENALTY[kind] * (n - 1);
        if (kind !== "cuisine" && n > cap) score -= OVER_CAP_PENALTY * (n - cap);
      }
    }
    for (const n of seen.values()) if (n > 1) score -= DUPLICATE_PENALTY * (n - 1);
    return score;
  }
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

function canUse(menu: readonly number[], c: number, allowRepeats: boolean) {
  return allowRepeats || !menu.includes(c);
}

/** Taille du vivier de recettes bon marché utilisé pour chercher le menu le moins cher. */
const CHEAP_POOL_SIZE = 70;

/**
 * Recettes les moins chères (coût de la part utilisée, placard déduit) : la recherche du
 * menu minimal s'y limite, ce qui garde un temps de calcul stable quand la base grandit.
 */
function cheapPool(ev: Evaluator, size = CHEAP_POOL_SIZE): number[] {
  const all = ev.candidates.map((_, i) => i);
  if (all.length <= size) return all;
  const estimate = (i: number) => {
    let used = 0;
    for (const [id, q] of ev.candidates[i]!.needs) {
      const item = ev.ctx.pantry.get(id);
      const fromPantry = item ? (item.quantity === null ? q : Math.min(q, item.quantity)) : 0;
      used += (q - fromPantry) * (bestUnitPrice(ev.ctx.priceBook.get(id) ?? []) ?? 0);
    }
    return used;
  };
  const cost = new Map(all.map((i) => [i, estimate(i)]));
  return all.sort((a, b) => cost.get(a)! - cost.get(b)! || a - b).slice(0, size);
}

/** Menu de `k` plats au coût minimal : glouton (coût marginal) puis recherche locale. */
function minCostMenu(
  ev: Evaluator,
  k: number,
  allowRepeats: boolean,
  pool: readonly number[] = cheapPool(ev),
  deadline = Infinity,
): number[] | null {
  const menu: number[] = [];
  for (let s = 0; s < k; s++) {
    let best = -1;
    let bestEval: Evaluation | null = null;
    for (const c of pool) {
      if (!canUse(menu, c, allowRepeats)) continue;
      const e = ev.evaluate([...menu, c]);
      if (!e.feasible) continue;
      if (!bestEval || e.cost < bestEval.cost || (e.cost === bestEval.cost && e.objective > bestEval.objective)) {
        best = c;
        bestEval = e;
      }
    }
    if (best < 0) return null;
    menu.push(best);
  }
  // Recherche locale : remplacer un plat tant que le coût baisse (dans le temps imparti).
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    const cur = ev.evaluate(menu);
    for (let s = 0; s < k && !improved; s++) {
      if (Date.now() > deadline) break;
      for (const c of pool) {
        if (c === menu[s] || !canUse(menu, c, allowRepeats)) continue;
        const next = [...menu];
        next[s] = c;
        const e = ev.evaluate(next);
        if (e.feasible && (e.cost < cur.cost || (e.cost === cur.cost && e.objective > cur.objective + 1e-9))) {
          menu[s] = c;
          improved = true;
          break;
        }
      }
    }
  }
  return menu;
}

/** Glouton par score : ajoute la meilleure recette tant qu'il reste de quoi finir sous le budget. */
function greedyByScore(ev: Evaluator, k: number, allowRepeats: boolean, order: readonly number[], floorPerMeal: number) {
  const menu: number[] = [];
  for (let s = 0; s < k; s++) {
    const remainingSlots = k - s - 1;
    let pick = -1;
    for (const c of order) {
      if (!canUse(menu, c, allowRepeats)) continue;
      const e = ev.evaluate([...menu, c]);
      if (e.feasible && e.cost + remainingSlots * floorPerMeal <= ev.budget) {
        pick = c;
        break;
      }
    }
    if (pick < 0) return null;
    menu.push(pick);
  }
  const e = ev.evaluate(menu);
  return e.feasible && e.cost <= ev.budget ? menu : null;
}

/** Recherche locale (meilleure amélioration) : maximise l'objectif sous contrainte coût ≤ budget. */
function improveUnderBudget(ev: Evaluator, start: number[], allowRepeats: boolean, deadline: number): number[] {
  const menu = [...start];
  let cur = ev.evaluate(menu);
  for (;;) {
    if (Date.now() > deadline) break;
    let bestMove: { s: number; c: number; e: Evaluation } | null = null;
    for (let s = 0; s < menu.length; s++) {
      if (Date.now() > deadline) break; // on garde la meilleure amélioration trouvée jusque-là
      for (let c = 0; c < ev.candidates.length; c++) {
        if (c === menu[s] || !canUse(menu, c, allowRepeats)) continue;
        const next = [...menu];
        next[s] = c;
        const e = ev.evaluate(next);
        if (!e.feasible || e.cost > ev.budget) continue;
        if (e.objective > (bestMove?.e.objective ?? cur.objective) + 1e-9) bestMove = { s, c, e };
      }
    }
    if (!bestMove) break;
    menu[bestMove.s] = bestMove.c;
    cur = bestMove.e;
  }
  return menu;
}

/* ------------------------------------------------------------------ */
/* API publique                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compose un menu de `prefs.meals` plats pour `prefs.persons` personnes dont le coût
 * en caisse (paquets entiers, placard déduit) est ≤ budget, en maximisant les goûts
 * et la variété. Si c'est impossible, renvoie le menu le moins cher et explique pourquoi.
 */
export function optimizeMenu(prefs: Preferences, ctx: EngineContext, options: OptimizeOptions = {}): MenuResult {
  const started = Date.now();
  const filtered = filterRecipes(prefs, ctx);
  const { candidates } = filtered;
  if (candidates.length === 0) return noCandidates(prefs, filtered, started);

  const allowRepeats = candidates.length < prefs.meals;
  const ev = new Evaluator(candidates, ctx, prefs.budgetCents, prefs.meals);
  const timeLimit = options.timeLimitMs ?? 1000;
  const pool = cheapPool(ev);
  const cheapest = minCostMenu(ev, prefs.meals, allowRepeats, pool, started + timeLimit * 0.5);
  if (!cheapest) return noCandidates(prefs, filtered, started);

  const cheapestEval = ev.evaluate(cheapest);
  if (cheapestEval.cost > prefs.budgetCents) {
    const result = buildResult(cheapest, prefs, ctx, ev, filtered, started);
    result.status = "over-budget";
    result.diagnostics.unshift(
      ...overBudgetDiagnostics(prefs, ctx, cheapestEval.cost, ev, allowRepeats, options, pool, started + timeLimit * 1.2),
    );
    return result;
  }

  // Points de départ variés, puis recherche locale sous contrainte de budget.
  const deadline = started + timeLimit;
  const byScore = candidates.map((_, i) => i).sort((a, b) => candidates[b]!.score - candidates[a]!.score);
  const floorPerMeal = Math.min(
    ...candidates.map((c) => {
      let used = 0;
      for (const [id, q] of c.needs) used += q * (bestUnitPrice(ctx.priceBook.get(id) ?? []) ?? 0);
      return Math.floor(used * 0.5); // borne basse prudente (placard, mutualisation)
    }),
  );
  const starts: number[][] = [cheapest];
  const fromInitial = (options.initial ?? [])
    .map((id) => candidates.findIndex((c) => c.recipe.id === id))
    .filter((i) => i >= 0);
  if (fromInitial.length === prefs.meals) {
    const e = ev.evaluate(fromInitial);
    if (e.feasible && e.cost <= prefs.budgetCents) starts.unshift(fromInitial);
  }
  const g = greedyByScore(ev, prefs.meals, allowRepeats, byScore, floorPerMeal);
  if (g) starts.push(g);
  const rng = createRng(prefs.seed + 1);
  for (let r = 0; r < 5; r++) {
    const order = byScore.map((i) => ({ i, k: rng() + candidates[i]!.score / 40 })).sort((a, b) => b.k - a.k).map((x) => x.i);
    const m = greedyByScore(ev, prefs.meals, allowRepeats, order, floorPerMeal);
    if (m) starts.push(m);
  }

  // Optimums locaux de chaque départ, puis tirage parmi ceux proches du meilleur :
  // deux générations successives ne redonnent pas forcément le même menu.
  const finals = new Map<string, { menu: number[]; objective: number }>();
  for (const s of starts) {
    const m = improveUnderBudget(ev, s, allowRepeats, deadline);
    const e = ev.evaluate(m);
    if (e.feasible && e.cost <= prefs.budgetCents) finals.set([...m].sort((a, b) => a - b).join(","), { menu: m, objective: e.objective });
  }
  const ranked = [...finals.values()].sort((a, b) => b.objective - a.objective);
  const top = ranked[0];
  if (!top) return buildResult(cheapest, prefs, ctx, ev, filtered, started);
  const tolerance = Math.max(1, Math.abs(top.objective) * NEAR_BEST);
  const near = ranked.filter((r) => r.objective >= top.objective - tolerance);
  // Réoptimisation d'un menu existant (budget modifié…) : on garde le meilleur, sans tirage.
  const chosen = fromInitial.length === prefs.meals ? top : (near[Math.floor(rng() * near.length)] ?? top);
  return buildResult(chosen.menu, prefs, ctx, ev, filtered, started);
}

/**
 * Recalcule un menu donné (ids de recettes) avec de nouvelles préférences
 * (nb de personnes, budget, magasin…), sans réoptimiser.
 */
export function evaluateMenu(recipeIds: readonly string[], prefs: Preferences, ctx: EngineContext): MenuResult {
  const started = Date.now();
  const filtered = filterRecipes(prefs, ctx);
  const ev = new Evaluator(filtered.candidates, ctx, prefs.budgetCents, prefs.meals);
  const indices: number[] = [];
  const invalid: string[] = [];
  for (const id of recipeIds) {
    const i = filtered.candidates.findIndex((c) => c.recipe.id === id);
    if (i >= 0) indices.push(i);
    else invalid.push(id);
  }
  if (indices.length === 0) return noCandidates(prefs, filtered, started);
  const result = buildResult(indices, { ...prefs, meals: indices.length }, ctx, ev, filtered, started);
  result.meals = prefs.meals;
  if (invalid.length > 0) {
    result.diagnostics.unshift({
      level: "warning",
      code: "recipe-no-longer-valid",
      message: `${invalid.length} plat(s) ne respecte(nt) plus vos critères et ont été retirés.`,
    });
  }
  if (result.totalCents > prefs.budgetCents) {
    result.status = "over-budget";
    result.diagnostics.unshift({
      level: "error",
      code: "over-budget",
      message: `Ce menu dépasse le budget de ${formatEuros(result.totalCents - prefs.budgetCents)}. Relancez l'optimisation pour l'ajuster.`,
    });
  }
  return result;
}

export interface SwapOption {
  recipeId: string;
  name: string;
  cuisine: string;
  totalMinutes: number;
  newTotalCents: Cents;
  deltaCents: Cents;
  fitsBudget: boolean;
  score: number;
}

/** Plats de remplacement pour la position `slot`, avec le nouveau total recalculé. */
export function swapOptions(
  recipeIds: readonly string[],
  slot: number,
  prefs: Preferences,
  ctx: EngineContext,
  limit = 12,
): SwapOption[] {
  const filtered = filterRecipes(prefs, ctx);
  const ev = new Evaluator(filtered.candidates, ctx, prefs.budgetCents, recipeIds.length);
  const idx = recipeIds.map((id) => filtered.candidates.findIndex((c) => c.recipe.id === id));
  const current = ev.evaluate(idx.filter((i) => i >= 0));
  const options: SwapOption[] = [];
  filtered.candidates.forEach((c, i) => {
    if (idx.includes(i)) return;
    const next = [...idx];
    next[slot] = i;
    const e = ev.evaluate(next.filter((x) => x >= 0));
    if (!e.feasible) return;
    options.push({
      recipeId: c.recipe.id,
      name: c.recipe.name,
      cuisine: c.recipe.cuisine,
      totalMinutes: c.recipe.prepMinutes + c.recipe.cookMinutes,
      newTotalCents: e.cost,
      deltaCents: e.cost - current.cost,
      fitsBudget: e.cost <= prefs.budgetCents,
      score: e.objective,
    });
  });
  const top = options
    .sort((a, b) => Number(b.fitsBudget) - Number(a.fitsBudget) || b.score - a.score || a.deltaCents - b.deltaCents)
    .slice(0, limit);
  // Total exact tel qu'il sera affiché après le swap (facultatifs ajoutés si le budget le permet).
  const base = evaluateMenu(recipeIds, prefs, ctx).totalCents;
  for (const o of top) {
    const ids = [...recipeIds];
    ids[slot] = o.recipeId;
    o.newTotalCents = evaluateMenu(ids, prefs, ctx).totalCents;
    o.deltaCents = o.newTotalCents - base;
    o.fitsBudget = o.newTotalCents <= prefs.budgetCents;
  }
  return top;
}

/* ------------------------------------------------------------------ */
/* Construction du résultat & diagnostics                              */
/* ------------------------------------------------------------------ */

/**
 * Ajoute les ingrédients facultatifs (herbes, fromage râpé…) un par un, du moins
 * cher au plus cher, tant que le total reste dans le budget.
 */
function enrichOptional(menu: readonly number[], ev: Evaluator, budget: Cents, ctx: EngineContext): Needs[] {
  const extras: Needs[] = menu.map(() => new Map());
  const base = ev.needs(menu);
  const total = (n: Needs) => buildShoppingList(n, ctx, ev.coverCache);
  const current = () => {
    const n = new Map(base);
    for (const e of extras) mergeNeeds(n, e);
    return n;
  };
  if (total(base).totalCents > budget) return extras;
  const pending = menu.flatMap((i, slot) => [...ev.candidates[i]!.optionalNeeds].map(([id, q]) => ({ slot, id, q })));
  while (pending.length > 0) {
    const now = current();
    const scored = pending
      .map((p, idx) => {
        const n = new Map(now);
        n.set(p.id, (n.get(p.id) ?? 0) + p.q);
        const l = total(n);
        return { idx, p, cost: l.unavailable.length ? Infinity : l.totalCents };
      })
      .sort((a, b) => a.cost - b.cost);
    const best = scored[0]!;
    if (best.cost > budget) break;
    extras[best.p.slot]!.set(best.p.id, best.p.q);
    pending.splice(best.idx, 1);
  }
  return extras;
}

function buildResult(
  menu: readonly number[],
  prefs: Preferences,
  ctx: EngineContext,
  ev: Evaluator,
  filtered: FilterResult,
  started: number,
  extras: readonly Needs[] = enrichOptional(menu, ev, prefs.budgetCents, ctx),
): MenuResult {
  const recipeNeeds = menu.map((i, k) => mergeNeeds(new Map(ev.candidates[i]!.needs), extras[k] ?? new Map()));
  const needs: Needs = new Map();
  for (const n of recipeNeeds) mergeNeeds(needs, n);
  const list = buildShoppingList(needs, ctx, ev.coverCache);
  const total = list.totalCents;
  const lineById = new Map(list.lines.map((l) => [l.ingredientId, l]));

  // Poids d'attribution : part achetée × meilleur prix unitaire.
  const weights = menu.map((_, k) => {
    let w = 0;
    for (const [id, q] of recipeNeeds[k]!) {
      const line = lineById.get(id);
      if (!line || line.needed <= 0) continue;
      w += q * (line.toBuy / line.needed) * (bestUnitPrice(ctx.priceBook.get(id) ?? []) ?? 0);
    }
    return w;
  });
  const allocated = allocateCents(total, weights);

  const recipes: MenuRecipe[] = menu.map((i, k) => {
    const c = ev.candidates[i]!;
    return {
      recipeId: c.recipe.id,
      name: c.recipe.name,
      cuisine: c.recipe.cuisine,
      totalMinutes: c.recipe.prepMinutes + c.recipe.cookMinutes,
      difficulty: c.recipe.difficulty,
      allocatedCents: allocated[k]!,
      perPersonCents: divideCeil(allocated[k]!, prefs.persons),
      standaloneCents: buildShoppingList(recipeNeeds[k]!, ctx, ev.coverCache).totalCents,
      droppedOptional: c.droppedOptional,
      skippedOptional: [...c.optionalNeeds.keys()].filter((id) => !extras[k]?.has(id)),
      pantryIngredientIds: [...recipeNeeds[k]!.keys()].filter((id) => (lineById.get(id)?.fromPantry ?? 0) > 0),
      nutrition: c.nutrition,
    };
  });
  const known = recipes.map((r) => r.nutrition).filter((n): n is Nutrition => !!n);
  const nutritionPerMeal: Nutrition | null =
    known.length === recipes.length && known.length > 0
      ? (["kcal", "protein", "carbs", "fat"] as const).reduce((acc, k) => ({ ...acc, [k]: Math.round(known.reduce((a, n) => a + n[k], 0) / known.length) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
      : null;

  const diagnostics: Diagnostic[] = [];
  if (filtered.candidates.length < prefs.meals) {
    diagnostics.push({
      level: "warning",
      code: "fewer-recipes-than-meals",
      message: `Seulement ${filtered.candidates.length} recette(s) compatible(s) avec vos critères : certains plats sont répétés.`,
    });
  }
  if (list.unavailable.length > 0) {
    diagnostics.push({
      level: "error",
      code: "unavailable",
      message: `Ingrédient(s) introuvable(s) : ${list.unavailable.map((id) => ctx.ingredients.get(id)?.name ?? id).join(", ")}.`,
    });
  }

  // Objectif nutritionnel : on dit franchement quand le budget ne permet pas de l'atteindre.
  if (nutritionPerMeal && prefs.nutritionGoal === "proteine" && nutritionPerMeal.protein < HIGH_PROTEIN_GRAMS - 5) {
    diagnostics.push({
      level: "warning",
      code: "nutrition-goal",
      message: `Objectif protéiné atteint en partie : ${nutritionPerMeal.protein} g de protéines par repas en moyenne (repère : ${HIGH_PROTEIN_GRAMS} g). Un budget un peu plus large ou des œufs, légumineuses et thon au placard aideront.`,
    });
  }
  if (nutritionPerMeal && prefs.nutritionGoal === "equilibre") {
    const s = energyShares(nutritionPerMeal);
    if (s.fat > 0.45 || s.carbs < 0.38 || s.protein < 0.1) {
      diagnostics.push({
        level: "warning",
        code: "nutrition-goal",
        message: `Équilibre atteint en partie : ${Math.round(s.protein * 100)} % protéines, ${Math.round(s.carbs * 100)} % glucides, ${Math.round(s.fat * 100)} % lipides (repère : 15 / 50 / 35).`,
      });
    }
  }

  let pantrySavingsCents = 0;
  if (ctx.pantry.size > 0) {
    const without = buildShoppingList(needs, { ...ctx, pantry: new Map() }, ev.coverCache);
    if (without.unavailable.length === 0) pantrySavingsCents = Math.max(0, without.totalCents - total);
    if (pantrySavingsCents > 0) {
      diagnostics.push({
        level: "info",
        code: "pantry-savings",
        message: `Votre placard vous fait économiser ${formatEuros(pantrySavingsCents)} sur ce menu.`,
      });
    }
  }

  return {
    status: total <= prefs.budgetCents ? "ok" : "over-budget",
    persons: prefs.persons,
    meals: prefs.meals,
    budgetCents: prefs.budgetCents,
    totalCents: total,
    remainingCents: prefs.budgetCents - total,
    perPersonPerMealCents: divideCeil(total, prefs.persons * Math.max(1, menu.length)),
    pantrySavingsCents,
    nutritionPerMeal,
    recipes,
    shoppingList: list,
    diagnostics,
    seed: prefs.seed,
    stats: { candidates: filtered.candidates.length, evaluations: ev.evaluations, elapsedMs: Date.now() - started },
  };
}

function noCandidates(prefs: Preferences, filtered: FilterResult, started: number): MenuResult {
  const counts = new Map<RejectionReason, number>();
  for (const r of filtered.rejected) for (const reason of r.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, n]) => `${REJECTION_LABELS[reason]} (${n} recettes écartées)`);
  return {
    status: "no-candidates",
    persons: prefs.persons,
    meals: prefs.meals,
    budgetCents: prefs.budgetCents,
    totalCents: 0,
    remainingCents: prefs.budgetCents,
    perPersonPerMealCents: 0,
    pantrySavingsCents: 0,
    nutritionPerMeal: null,
    recipes: [],
    shoppingList: { lines: [], totalCents: 0, usedCostCents: 0, unavailable: [] },
    diagnostics: [
      {
        level: "error",
        code: "no-candidates",
        message: `Aucune recette ne respecte toutes vos contraintes. Les plus bloquantes : ${top.join(", ") || "inconnues"}.`,
      },
    ],
    seed: prefs.seed,
    stats: { candidates: 0, evaluations: 0, elapsedMs: Date.now() - started },
  };
}

function overBudgetDiagnostics(
  prefs: Preferences,
  ctx: EngineContext,
  minCost: Cents,
  ev: Evaluator,
  allowRepeats: boolean,
  options: OptimizeOptions,
  pool: readonly number[],
  deadline: number,
): Diagnostic[] {
  const shortfall = minCost - prefs.budgetCents;
  const diags: Diagnostic[] = [
    {
      level: "error",
      code: "over-budget",
      message:
        `Il manque ${formatEuros(shortfall)} pour ${prefs.persons} personne${prefs.persons > 1 ? "s" : ""} ` +
        `et ${prefs.meals} repas : le menu le moins cher possible coûte ${formatEuros(minCost)} ` +
        `pour un budget de ${formatEuros(prefs.budgetCents)}.`,
    },
  ];
  if (options.withSuggestions === false) return diags;

  // Le coût minimal croît avec le nombre de repas / de personnes : recherche dichotomique
  // du plus grand nombre qui tient dans le budget.
  const largestFitting = (hi: number, fits: (n: number) => boolean): number => {
    let lo = 0;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const plural = (n: number) => (n > 1 ? "s" : "");

  const k = largestFitting(prefs.meals - 1, (n) => {
    const m = minCostMenu(ev, n, allowRepeats, pool, deadline);
    return !!m && ev.evaluate(m).cost <= prefs.budgetCents;
  });
  if (k > 0) {
    diags.push({
      level: "info",
      code: "suggest-meals",
      message: `Avec ce budget, vous pouvez composer ${k} repas pour ${prefs.persons} personne${plural(prefs.persons)}.`,
    });
  }
  const persons = largestFitting(prefs.persons - 1, (n) => {
    const f = filterRecipes({ ...prefs, persons: n }, ctx);
    if (f.candidates.length === 0) return false;
    const ev2 = new Evaluator(f.candidates, ctx, prefs.budgetCents, prefs.meals);
    const m = minCostMenu(ev2, prefs.meals, f.candidates.length < prefs.meals, cheapPool(ev2), deadline);
    return !!m && ev2.evaluate(m).cost <= prefs.budgetCents;
  });
  if (persons > 0) {
    diags.push({
      level: "info",
      code: "suggest-persons",
      message: `${k > 0 ? "Ou" : "Avec ce budget, vous pouvez composer"} ${prefs.meals} repas pour ${persons} personne${plural(persons)}.`,
    });
  }
  return diags;
}
