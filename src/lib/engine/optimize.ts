import type { Nutrition, Preferences } from "@/lib/domain/schemas";
import { allocateCents, divideCeil, formatEuros, type Cents } from "./money";
import { HIGH_PROTEIN_GRAMS, energyShares } from "./nutrition";
import { bestUnitPrice } from "./packaging";
import { courseOf, filterRecipes, portionsPerMeal, REJECTION_LABELS, sessionMinutesFor, type FilterResult, type PreparedRecipe, type RejectionReason } from "./recipes";
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
  /** Ingrédients remplacés dans ce plat. */
  substituted: { from: string; to: string }[];
  /** Protéine principale (déduite des ingrédients). */
  protein: string | null;
  /** Grammes de fruits et légumes par portion. */
  vegGrams: number;
  /** Plat de saison ce mois-ci. */
  seasonal: boolean;
}

/** Dessert ou petit-déjeuner ajouté au menu (compris dans le budget). */
export interface ExtraRecipe {
  recipeId: string;
  name: string;
  course: "dessert" | "petit-dejeuner";
  totalMinutes: number;
  allocatedCents: Cents;
  pantryIngredientIds: string[];
  seasonal: boolean;
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
    | "nutrition-goal"
    | "cheapest-mode"
    | "extras";
  message: string;
}

export type MenuStatus = "ok" | "over-budget" | "no-candidates";

/** Batch cooking : ce qui se prépare en une fois. Les numéros de soir commencent à 0. */
export interface PrepPlan {
  /** Plats cuisinés une fois pour plusieurs soirs consécutifs. */
  cookOnce: { recipeId: string; name: string; slots: number[]; fridgeDays: number | null }[];
  /** Bases communes à cuire ensemble (riz, pâtes…), quantité totale en unité de base. */
  sharedBases: { ingredientId: string; name: string; unit: "g" | "ml" | "piece"; quantity: number; slots: number[] }[];
  /** Durée estimée de la session qui prépare tout le menu (minutes). */
  sessionMinutes: number;
  /** Soirs (0 = jour de la session) dont la portion passe au congélateur. */
  freezeSlots: number[];
  /** Soirs dont le plat ne tient pas jusque-là (à cuisiner frais) : vide si tout va bien. */
  freshSlots: number[];
}

export interface MenuResult {
  status: MenuStatus;
  persons: number;
  /** Portions en plus pour le lendemain midi. */
  lunchPortions: number;
  meals: number;
  budgetCents: Cents;
  totalCents: Cents;
  remainingCents: Cents;
  perPersonPerMealCents: Cents;
  pantrySavingsCents: Cents;
  /** Moyenne par repas et par personne (null si inconnue). */
  nutritionPerMeal: Nutrition | null;
  /** Plan de préparation (batch cooking activé), sinon null. */
  prepPlan: PrepPlan | null;
  recipes: MenuRecipe[];
  /** Desserts et petits-déjeuners (vide si aucun demandé). */
  extras: ExtraRecipe[];
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
/** Batch cooking : bonus par soir couvert sans recuisiner, et par plat qui partage la base d'un autre. */
const BATCH_REPEAT_BONUS = 1.5;
/** Batch cooking : session trop longue, plat qui ne tient pas jusqu'à son soir, ingrédients partagés. */
const SESSION_OVER_PENALTY = 10;
const KEEP_PENALTY = 25;
const SHARED_INGREDIENT_BONUS = 1;
const SHARED_BASE_BONUS = 3;
/** Bases qui se cuisent à l'avance (pas le pain ni les pâtes à tarte). */
const COOKABLE_BASES = new Set(["pates", "riz", "pommes-de-terre", "cereales", "legumineuses"]);
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
    /** Batch cooking : un plat peut couvrir plusieurs soirs ; les bases communes sont favorisées. */
    readonly batch = false,
    /** Batch cooking : durée maximale de la session (minutes). */
    readonly sessionLimit = 180,
  ) {}

  /** Peut-on (encore) ajouter la recette `c` à ce menu ? */
  canUse(menu: readonly number[], c: number, allowRepeats: boolean): boolean {
    if (allowRepeats) return true;
    const n = menu.reduce((a, x) => a + (x === c ? 1 : 0), 0);
    return n === 0 || (this.batch && n < this.candidates[c]!.maxCover);
  }

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
      score += this.candidates[i]!.score;
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
    // Variété : en batch cooking, un plat cuisiné une fois pour plusieurs soirs compte une seule fois.
    const counted = this.batch ? [...seen.keys()] : menu;
    const sharedBase = new Map<string, number>();
    for (const i of counted) {
      const c = this.candidates[i]!;
      bump(count.cuisine, c.recipe.cuisine);
      bump(count.protein, c.protein);
      bump(count.base, c.base);
      if (c.base && COOKABLE_BASES.has(c.base)) bump(sharedBase, c.baseIngredientId);
    }
    const cap = varietyCap(menu.length);
    for (const kind of ["cuisine", "protein", "base"] as const) {
      if (this.batch && kind === "base") continue; // partager une base est justement le but
      for (const n of count[kind].values()) {
        score -= REPEAT_PENALTY[kind] * (n - 1);
        if (kind !== "cuisine" && n > cap) score -= OVER_CAP_PENALTY * (n - cap);
      }
    }
    for (const [i, n] of seen) {
      if (n <= 1) continue;
      const cover = this.batch ? this.candidates[i]!.maxCover : 1;
      const covered = Math.min(n, cover);
      score += BATCH_REPEAT_BONUS * (covered - 1); // une cuisson de moins
      score -= DUPLICATE_PENALTY * (n - covered);
    }
    if (this.batch) {
      for (const n of sharedBase.values()) if (n > 1) score += SHARED_BASE_BONUS * (n - 1);
      const distinct = [...seen.keys()].map((i) => this.candidates[i]!);
      // 1) Tout se prépare en une session qui tient dans le temps choisi.
      const session = sessionMinutesFor(distinct.map((c) => c.recipe));
      if (session > this.sessionLimit) score -= SESSION_OVER_PENALTY + (session - this.sessionLimit) / 4;
      // 2) Chaque plat doit tenir jusqu'à son soir (les plus fragiles d'abord).
      const caps = menu.map((i) => this.candidates[i]!.keepDays).sort((a, b) => a - b);
      caps.forEach((cap, day) => {
        if (cap < day) score -= KEEP_PENALTY;
      });
      // 3) Ingrédients communs : moins de courses, épluchage et découpe groupés.
      const uses = new Map<string, number>();
      for (const c of distinct) for (const id of c.needs.keys()) if (!this.ctx.ingredients.get(id)?.staple) uses.set(id, (uses.get(id) ?? 0) + 1);
      let shared = 0;
      for (const n of uses.values()) if (n > 1) shared += n - 1;
      score += SHARED_INGREDIENT_BONUS * Math.min(10, shared);
    }
    return score;
  }
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

/** Batch cooking : on regroupe les soirs d'un même plat, puis les plats qui partagent une base. */
function batchOrder(menu: readonly number[], ev: Evaluator): number[] {
  if (!ev.batch) return [...menu];
  const groups = new Map<number, number>();
  for (const i of menu) groups.set(i, (groups.get(i) ?? 0) + 1);
  return [...groups.entries()]
    .map(([i, n], order) => ({ i, n, order, keep: ev.candidates[i]!.keepDays, base: ev.candidates[i]!.baseIngredientId ?? "\uffff" }))
    // Les plats qui se gardent le moins d'abord ; puis les plats qui partagent une base.
    .sort((a, b) => a.keep - b.keep || a.base.localeCompare(b.base) || a.order - b.order)
    .flatMap(({ i, n }) => Array.from({ length: n }, () => i));
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
      if (!ev.canUse(menu, c, allowRepeats)) continue;
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
        if (c === menu[s] || !ev.canUse(menu, c, allowRepeats)) continue;
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
      if (!ev.canUse(menu, c, allowRepeats)) continue;
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
        if (c === menu[s] || !ev.canUse(menu, c, allowRepeats)) continue;
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
function optimizeDinners(prefs: Preferences, ctx: EngineContext, options: OptimizeOptions = {}): MenuResult {
  const started = Date.now();
  const filtered = filterRecipes(prefs, ctx);
  const { candidates } = filtered;
  if (candidates.length === 0) return noCandidates(prefs, filtered, started);

  const allowRepeats = candidates.length < prefs.meals;
  const ev = new Evaluator(candidates, ctx, prefs.budgetCents, prefs.meals, prefs.batchCooking, prefs.batchSessionMinutes);
  const timeLimit = options.timeLimitMs ?? 1000;
  const pool = cheapPool(ev);
  const cheapest = minCostMenu(ev, prefs.meals, allowRepeats, pool, started + timeLimit * 0.5);
  if (!cheapest) return noCandidates(prefs, filtered, started);

  const cheapestEval = ev.evaluate(cheapest);
  if (prefs.cheapestMode && cheapestEval.cost <= prefs.budgetCents) {
    const result = buildResult(batchOrder(cheapest, ev), prefs, ctx, ev, filtered, started);
    result.diagnostics.unshift({
      level: "info",
      code: "cheapest-mode",
      message: `Mode fin de mois : le menu le moins cher possible avec votre placard, soit ${formatEuros(result.totalCents)} (≈ ${formatEuros(result.perPersonPerMealCents)} la portion).`,
    });
    return result;
  }
  if (cheapestEval.cost > prefs.budgetCents) {
    const result = buildResult(batchOrder(cheapest, ev), prefs, ctx, ev, filtered, started);
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
  if (!top) return buildResult(batchOrder(cheapest, ev), prefs, ctx, ev, filtered, started);
  const tolerance = Math.max(1, Math.abs(top.objective) * NEAR_BEST);
  const near = ranked.filter((r) => r.objective >= top.objective - tolerance);
  // Réoptimisation d'un menu existant (budget modifié…) : on garde le meilleur, sans tirage.
  const chosen = fromInitial.length === prefs.meals ? top : (near[Math.floor(rng() * near.length)] ?? top);
  return buildResult(batchOrder(chosen.menu, ev), prefs, ctx, ev, filtered, started);
}

/* ------------------------------------------------------------------ */
/* Desserts et petits-déjeuners                                         */
/* ------------------------------------------------------------------ */

/** Poids du coût (par euro) face au score pour choisir un dessert ou un petit-déjeuner. */
const EXTRA_COST_WEIGHT = 1.5;
/** Pénalité pour reprendre un dessert déjà prévu (on préfère varier). */
const EXTRA_REPEAT_PENALTY = 4;

/**
 * Compose le menu : les dîners d'abord (avec une réserve de budget pour les desserts et
 * petits-déjeuners demandés), puis desserts et petits-déjeuners choisis un par un selon leur
 * coût réel en plus des courses déjà prévues (œufs, lait… déjà achetés coûtent moins cher).
 * Le total en caisse ne dépasse jamais le budget : s'il ne suffit pas, on en prévoit moins.
 */
export function optimizeMenu(prefs: Preferences, ctx: EngineContext, options: OptimizeOptions = {}): MenuResult {
  const wanted = { dessert: prefs.desserts ?? 0, "petit-dejeuner": prefs.breakfasts ?? 0 };
  if (wanted.dessert + wanted["petit-dejeuner"] === 0) return optimizeDinners(prefs, ctx, options);

  const pools = {
    dessert: filterRecipes(prefs, ctx, "dessert").candidates,
    "petit-dejeuner": filterRecipes(prefs, ctx, "petit-dejeuner").candidates,
  };
  const coverCache: CoverCache = new Map();
  const costOf = (n: Needs) => buildShoppingList(n, ctx, coverCache).totalCents;
  // Réserve : les moins chers de chaque type, seuls (borne haute, les ingrédients partagés coûteront moins).
  let reserve = 0;
  for (const course of ["dessert", "petit-dejeuner"] as const) {
    const costs = pools[course].map((c) => costOf(c.needs)).sort((a, b) => a - b);
    for (let k = 0; k < wanted[course] && costs.length; k++) reserve += costs[k % Math.min(costs.length, 3)]!;
  }
  const dinnerPool = new Map(filterRecipes(prefs, ctx).candidates.map((c) => [c.recipe.id, c]));
  const rng = createRng(prefs.seed + 7);
  const noise = new Map([...pools.dessert, ...pools["petit-dejeuner"]].map((c) => [c.recipe.id, rng() * 3]));

  /** Dîners avec une réserve donnée, puis ajout glouton des desserts et petits-déjeuners. */
  const attempt = (reserveCents: number) => {
    let dinners = optimizeDinners({ ...prefs, budgetCents: Math.max(0, prefs.budgetCents - reserveCents) }, ctx, options);
    if (dinners.status !== "ok") dinners = optimizeDinners(prefs, ctx, options);
    const dinnerIds = dinners.recipes.map((r) => r.recipeId);
    const needs: Needs = new Map();
    for (const id of dinnerIds) mergeNeeds(needs, new Map(dinnerPool.get(id)?.needs ?? []));
    const chosen: string[] = [];
    const missing = { dessert: 0, "petit-dejeuner": 0 };
    let current = costOf(needs);
    // Desserts et petits-déjeuners en alternance : si le budget manque, on en retire un peu des deux.
    const slots: ("dessert" | "petit-dejeuner")[] = [];
    for (let k = 0; k < Math.max(wanted.dessert, wanted["petit-dejeuner"]); k++) {
      if (k < wanted.dessert) slots.push("dessert");
      if (k < wanted["petit-dejeuner"]) slots.push("petit-dejeuner");
    }
    for (const course of slots) {
      if (missing[course] > 0) {
        missing[course]++;
        continue;
      }
      const pick = (allowRepeat: boolean) => {
        let best: { c: PreparedRecipe; value: number; cost: number } | null = null;
        for (const c of pools[course]) {
          const repeats = chosen.filter((id) => id === c.recipe.id).length;
          if (repeats > 0 && !allowRepeat) continue;
          const cost = costOf(mergeNeeds(new Map(needs), c.needs));
          if (cost > prefs.budgetCents) continue;
          const value = c.score + (noise.get(c.recipe.id) ?? 0) - EXTRA_COST_WEIGHT * ((cost - current) / 100) - EXTRA_REPEAT_PENALTY * repeats;
          if (!best || value > best.value) best = { c, value, cost };
        }
        return best;
      };
      // On varie d'abord ; on ne reprend un dessert déjà prévu que si aucun autre ne tient dans le budget.
      const best = pick(false) ?? pick(true);
      if (!best) {
        missing[course] = 1;
        continue;
      }
      mergeNeeds(needs, best.c.needs);
      current = best.cost;
      chosen.push(best.c.recipe.id);
    }
    return { dinners, dinnerIds, chosen, missing };
  };

  let run = attempt(reserve);
  // Il en manque : on réserve davantage (dîners un peu plus économiques), jusqu'à deux fois.
  for (let tries = 0; tries < 2 && run.missing.dessert + run.missing["petit-dejeuner"] > 0 && run.dinners.status === "ok"; tries++) {
    reserve = Math.round(reserve * 1.6) + 300;
    const next = attempt(reserve);
    if (next.dinners.status !== "ok" || next.dinners.recipes.length === 0) break;
    if (next.chosen.length > run.chosen.length) run = next;
  }
  const { dinners, dinnerIds, chosen, missing } = run;
  if (dinners.status === "no-candidates" || dinnerIds.length === 0) return dinners;

  const result = evaluateMenu([...dinnerIds, ...chosen], prefs, ctx);
  result.meals = prefs.meals;
  result.seed = dinners.seed;
  result.stats = dinners.stats;
  const keep = new Set(["recipe-no-longer-valid", "over-budget"]);
  result.diagnostics = [...dinners.diagnostics.filter((d) => !keep.has(d.code) && d.code !== "pantry-savings"), ...result.diagnostics.filter((d) => d.code === "pantry-savings" || keep.has(d.code))];
  const lacking = [
    missing.dessert && `${missing.dessert} dessert${missing.dessert > 1 ? "s" : ""}`,
    missing["petit-dejeuner"] && `${missing["petit-dejeuner"]} petit${missing["petit-dejeuner"] > 1 ? "s" : ""}-déjeuner${missing["petit-dejeuner"] > 1 ? "s" : ""}`,
  ].filter(Boolean);
  if (lacking.length) {
    result.diagnostics.unshift({
      level: "warning",
      code: "extras",
      message: `Le budget ne permet pas d'ajouter ${lacking.join(" et ")} de plus : les dîners passent en priorité.`,
    });
  } else if ((pools.dessert.length === 0 && wanted.dessert) || (pools["petit-dejeuner"].length === 0 && wanted["petit-dejeuner"])) {
    result.diagnostics.unshift({ level: "warning", code: "extras", message: "Aucun dessert ou petit-déjeuner ne respecte vos critères (régime, allergies, exclusions)." });
  }
  return result;
}

/**
 * Recalcule un menu donné (ids de recettes) avec de nouvelles préférences
 * (nb de personnes, budget, magasin…), sans réoptimiser.
 */
export function evaluateMenu(recipeIds: readonly string[], prefs: Preferences, ctx: EngineContext): MenuResult {
  const started = Date.now();
  const filtered = filterRecipes(prefs, ctx);
  const ev = new Evaluator(filtered.candidates, ctx, prefs.budgetCents, prefs.meals, prefs.batchCooking, prefs.batchSessionMinutes);
  const sidePool = new Map(
    [...filterRecipes(prefs, ctx, "dessert").candidates, ...filterRecipes(prefs, ctx, "petit-dejeuner").candidates].map((c) => [c.recipe.id, c]),
  );
  const indices: number[] = [];
  const sides: PreparedRecipe[] = [];
  const invalid: string[] = [];
  for (const id of recipeIds) {
    const i = filtered.candidates.findIndex((c) => c.recipe.id === id);
    const side = sidePool.get(id);
    if (i >= 0) indices.push(i);
    else if (side) sides.push(side);
    else invalid.push(id);
  }
  if (indices.length === 0) return noCandidates(prefs, filtered, started);
  // Les plats facultatifs (pain, fromage…) ne s'achètent qu'avec ce qui reste une fois desserts et petits-déjeuners payés.
  const dinnerNeeds: Needs = new Map();
  for (const i of indices) mergeNeeds(dinnerNeeds, new Map(ev.candidates[i]!.needs));
  const withSides = new Map(dinnerNeeds);
  for (const c of sides) mergeNeeds(withSides, c.needs);
  const sidesCost = sides.length
    ? buildShoppingList(withSides, ctx, ev.coverCache).totalCents - buildShoppingList(dinnerNeeds, ctx, ev.coverCache).totalCents
    : 0;
  const result = buildResult(
    indices,
    { ...prefs, meals: indices.length },
    ctx,
    ev,
    filtered,
    started,
    enrichOptional(indices, ev, prefs.budgetCents - sidesCost, ctx),
    sides,
  );
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
  const ev = new Evaluator(filtered.candidates, ctx, prefs.budgetCents, recipeIds.length, prefs.batchCooking, prefs.batchSessionMinutes);
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
  sides: readonly PreparedRecipe[] = [],
): MenuResult {
  const recipeNeeds = menu.map((i, k) => mergeNeeds(new Map(ev.candidates[i]!.needs), extras[k] ?? new Map()));
  const sideNeeds = sides.map((c) => c.needs);
  const needs: Needs = new Map();
  for (const n of [...recipeNeeds, ...sideNeeds]) mergeNeeds(needs, n);
  const list = buildShoppingList(needs, ctx, ev.coverCache);
  const total = list.totalCents;
  const lineById = new Map(list.lines.map((l) => [l.ingredientId, l]));

  // Poids d'attribution : part achetée × meilleur prix unitaire.
  const weights = [...recipeNeeds, ...sideNeeds].map((itemNeeds) => {
    let w = 0;
    for (const [id, q] of itemNeeds) {
      const line = lineById.get(id);
      if (!line || line.needed <= 0) continue;
      w += q * (line.toBuy / line.needed) * (bestUnitPrice(ctx.priceBook.get(id) ?? []) ?? 0);
    }
    return w;
  });
  const allocated = allocateCents(total, weights);
  const extrasOut: ExtraRecipe[] = sides.map((c, k) => ({
    recipeId: c.recipe.id,
    name: c.recipe.name,
    course: courseOf(c.recipe) === "petit-dejeuner" ? "petit-dejeuner" : "dessert",
    totalMinutes: c.recipe.prepMinutes + c.recipe.cookMinutes,
    allocatedCents: allocated[menu.length + k]!,
    pantryIngredientIds: [...c.needs.keys()].filter((id) => (lineById.get(id)?.fromPantry ?? 0) > 0),
    seasonal: c.seasonal,
  }));
  const dinnersCents = allocated.slice(0, menu.length).reduce((a, b) => a + b, 0);

  const recipes: MenuRecipe[] = menu.map((i, k) => {
    const c = ev.candidates[i]!;
    return {
      recipeId: c.recipe.id,
      name: c.recipe.name,
      cuisine: c.recipe.cuisine,
      totalMinutes: c.recipe.prepMinutes + c.recipe.cookMinutes,
      difficulty: c.recipe.difficulty,
      allocatedCents: allocated[k]!,
      perPersonCents: divideCeil(allocated[k]!, portionsPerMeal(prefs)),
      standaloneCents: buildShoppingList(recipeNeeds[k]!, ctx, ev.coverCache).totalCents,
      droppedOptional: c.droppedOptional,
      skippedOptional: [...c.optionalNeeds.keys()].filter((id) => !extras[k]?.has(id)),
      pantryIngredientIds: [...recipeNeeds[k]!.keys()].filter((id) => (lineById.get(id)?.fromPantry ?? 0) > 0),
      nutrition: c.nutrition,
      substituted: c.substituted,
      protein: c.protein,
      vegGrams: c.vegGrams,
      seasonal: c.seasonal,
    };
  });
  let prepPlan: PrepPlan | null = null;
  if (prefs.batchCooking) {
    const bySlots = new Map<number, number[]>();
    menu.forEach((i, k) => bySlots.set(i, [...(bySlots.get(i) ?? []), k]));
    const cookOnce = [...bySlots.entries()]
      .filter(([, slots]) => slots.length > 1)
      .map(([i, slots]) => ({ recipeId: ev.candidates[i]!.recipe.id, name: ev.candidates[i]!.recipe.name, slots, fridgeDays: ev.candidates[i]!.recipe.fridgeDays ?? null }));
    const baseSlots = new Map<string, { recipes: Set<number>; slots: number[]; quantity: number }>();
    menu.forEach((i, k) => {
      const c = ev.candidates[i]!;
      const id = c.baseIngredientId;
      if (!id || !c.base || !COOKABLE_BASES.has(c.base)) return;
      const cur = baseSlots.get(id) ?? { recipes: new Set<number>(), slots: [], quantity: 0 };
      cur.recipes.add(i);
      cur.slots.push(k);
      cur.quantity += recipeNeeds[k]!.get(id) ?? 0;
      baseSlots.set(id, cur);
    });
    const sharedBases = [...baseSlots.entries()]
      .filter(([, b]) => b.recipes.size > 1)
      .map(([id, b]) => {
        const ing = ctx.ingredients.get(id);
        return { ingredientId: id, name: ing?.name ?? id, unit: ing?.unit ?? "g", quantity: Math.round(b.quantity), slots: b.slots };
      });
    const distinct = [...new Set(menu)].map((i) => ev.candidates[i]!);
    const freezeSlots: number[] = [];
    const freshSlots: number[] = [];
    menu.forEach((i, day) => {
      const c = ev.candidates[i]!;
      if (day <= (c.recipe.fridgeDays ?? 1) || (day <= 1 && c.keepDays >= day)) return;
      if (c.recipe.freezable && c.recipe.reheats) freezeSlots.push(day);
      else if (c.keepDays < day) freshSlots.push(day);
    });
    prepPlan = { cookOnce, sharedBases, sessionMinutes: sessionMinutesFor(distinct.map((c) => c.recipe)), freezeSlots, freshSlots };
  }
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
    lunchPortions: prefs.lunchPortions ?? 0,
    meals: prefs.meals,
    budgetCents: prefs.budgetCents,
    totalCents: total,
    remainingCents: prefs.budgetCents - total,
    perPersonPerMealCents: divideCeil(dinnersCents, portionsPerMeal(prefs) * Math.max(1, menu.length)),
    pantrySavingsCents,
    nutritionPerMeal,
    prepPlan,
    recipes,
    extras: extrasOut,
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
    lunchPortions: prefs.lunchPortions ?? 0,
    meals: prefs.meals,
    budgetCents: prefs.budgetCents,
    totalCents: 0,
    remainingCents: prefs.budgetCents,
    perPersonPerMealCents: 0,
    pantrySavingsCents: 0,
    nutritionPerMeal: null,
    prepPlan: null,
    recipes: [],
    extras: [],
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
    const ev2 = new Evaluator(f.candidates, ctx, prefs.budgetCents, prefs.meals, prefs.batchCooking, prefs.batchSessionMinutes);
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
