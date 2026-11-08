import type { Allergen, Nutrition, Preferences, Recipe } from "@/lib/domain/schemas";
import { isOriginAllowed } from "./diet";
import { deriveRecipeFacts, type Base, type Protein } from "./facts";
import { nutritionBonus, nutritionPerPortion } from "./nutrition";
import { hashString } from "./rng";
import { buildShoppingList, pantryQuantity } from "./shopping";
import type { EngineContext, Needs, ShoppingList } from "./types";
import { toBaseQuantity } from "./units";

export type RejectionReason =
  | "regime"
  | "allergene"
  | "aliment-exclu"
  | "temps"
  | "difficulte"
  | "equipement"
  | "indisponible";

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  regime: "régime alimentaire",
  allergene: "allergènes",
  "aliment-exclu": "aliments exclus",
  temps: "temps de préparation",
  difficulte: "niveau de cuisine",
  equipement: "équipement",
  indisponible: "ingrédient indisponible en magasin",
};

/** Recette prête pour l'optimisation : besoins calculés pour le nombre de personnes. */
export interface PreparedRecipe {
  recipe: Recipe;
  /** Besoins essentiels (hors ingrédients facultatifs). */
  needs: Needs;
  /** Ingrédients facultatifs compatibles, ajoutés seulement si le budget le permet. */
  optionalNeeds: Needs;
  /** Ingrédients facultatifs retirés car incompatibles ou indisponibles. */
  droppedOptional: string[];
  score: number;
  /** Indicateurs utiles à la variété (déduits des ingrédients). */
  protein: Protein | null;
  base: Base | null;
  /** Valeurs nutritionnelles d'une portion (ingrédients essentiels). */
  nutrition: Nutrition | null;
  baseIngredientId: string | null;
  /** Ingrédients remplacés dans ce plat (substitutions appliquées). */
  substituted: { from: string; to: string }[];
  /** Grammes de fruits et légumes par portion (équilibre de la semaine). */
  vegGrams: number;
  /** Au moins un produit de saison et aucun hors saison. */
  seasonal: boolean;
  /**
   * Nombre de soirs qu'un même plat peut couvrir en batch cooking (1 = un seul soir) :
   * il faut qu'il se réchauffe bien, se garde au frigo, et que ses portions suffisent.
   */
  maxCover: number;
  /** Batch cooking : nombre de jours après la session où le plat peut encore être servi. */
  keepDays: number;
}

/** Au-delà, on considère le plat « sans limite » (il se congèle). */
export const FREEZER_DAYS = 99;

/**
 * Jours après la session où le plat peut être servi : la durée au frigo, ou sans limite
 * s'il se congèle et se réchauffe ; un plat qui ne se réchauffe pas se mange au plus
 * le lendemain ; sans données de conservation, le jour même ou le lendemain.
 */
export function keepDaysFor(recipe: Pick<Recipe, "fridgeDays" | "freezable" | "reheats">): number {
  if (recipe.reheats === undefined && recipe.fridgeDays === undefined) return 1;
  const fridge = recipe.fridgeDays ?? 1;
  if (recipe.reheats && recipe.freezable) return FREEZER_DAYS;
  return recipe.reheats ? fridge : Math.min(fridge, 1);
}

/**
 * Durée estimée d'une session qui prépare ces plats : les préparations s'enchaînent,
 * les cuissons se chevauchent (au plus 3 en même temps : four + 2 feux).
 */
export function sessionMinutesFor(recipes: readonly Pick<Recipe, "prepMinutes" | "cookMinutes">[]): number {
  if (recipes.length === 0) return 0;
  const prep = recipes.reduce((a, r) => a + r.prepMinutes, 0);
  const cooks = recipes.map((r) => r.cookMinutes);
  const cookSpan = Math.max(Math.max(...cooks), Math.ceil(cooks.reduce((a, c) => a + c, 0) / 3));
  return prep + cookSpan;
}

/** Aromates, condiments et agrumes : ne comptent pas comme portion de légumes. */
const NOT_VEGETABLES = new Set(["ail", "gingembre", "citron", "citron-vert", "persil", "coriandre", "basilic", "ciboulette", "menthe", "estragon", "aneth", "piment-frais", "citronnelle", "oignon-nouveau"]);
const VEG_EXTRA = new Set([
  "petits-pois-surgeles", "haricots-verts-surgeles", "epinards-surgeles", "legumes-wok", "ratatouille-surgelee", "brocoli-surgele", "choux-bruxelles-surgeles",
  "petits-pois-carottes-surgeles", "legumes-potage-surgeles", "tomates-concassees", "mais-conserve", "petits-pois-conserve", "champignons-conserve", "ananas-conserve", "gaspacho",
]);

/** Fruits et légumes (frais, surgelés, en conserve) par portion, en grammes. */
export function vegetableGrams(needs: Needs, ctx: EngineContext, portions: number): number {
  let g = 0;
  for (const [id, q] of needs) {
    const ing = ctx.ingredients.get(id);
    if (!ing || NOT_VEGETABLES.has(id) || ing.unit === "piece") continue;
    if (ing.aisle === "fruits-legumes" || VEG_EXTRA.has(id)) g += q;
  }
  return Math.round(g / Math.max(1, portions));
}

/** Portions cuisinées par repas : les convives, plus les portions pour le lendemain midi. */
export function portionsPerMeal(prefs: Pick<Preferences, "persons"> & Partial<Pick<Preferences, "lunchPortions">>): number {
  return prefs.persons + (prefs.lunchPortions ?? 0);
}

/** Saisonnalité d'une recette ce mois-ci : produits frais de saison / hors saison utilisés. */
export function seasonality(needs: Needs, ctx: EngineContext): { inSeason: number; outOfSeason: number } {
  const month = Number(ctx.today.slice(5, 7));
  let inSeason = 0;
  let outOfSeason = 0;
  for (const id of needs.keys()) {
    const season = ctx.ingredients.get(id)?.season;
    if (!season?.length) continue;
    if (season.includes(month)) inSeason++;
    else outOfSeason++;
  }
  return { inSeason, outOfSeason };
}

/** Au plus 3 soirs pour un même plat, même s'il se garde plus longtemps (on garde de la variété). */
export const MAX_COVER = 3;

/** Soirs consécutifs qu'une recette peut couvrir pour `persons` personnes. */
export function coverFor(recipe: Pick<Recipe, "portions" | "fridgeDays" | "reheats">, persons: number): number {
  if (recipe.reheats !== true || !recipe.fridgeDays || !recipe.portions) return 1;
  return Math.max(1, Math.min(MAX_COVER, recipe.fridgeDays + 1, Math.floor(recipe.portions / persons)));
}

export interface FilterResult {
  candidates: PreparedRecipe[];
  rejected: { recipeId: string; reasons: RejectionReason[] }[];
}

type Constraints = Pick<
  Preferences,
  "diet" | "allergens" | "excludedIngredientIds" | "maxTotalMinutes" | "maxDifficulty" | "equipment"
>;

/** Pourquoi un ingrédient est-il interdit pour ces préférences ? (null = autorisé) */
function ingredientViolation(ingredientId: string, prefs: Constraints, ctx: EngineContext): RejectionReason | null {
  const ing = ctx.ingredients.get(ingredientId);
  if (!ing) return "indisponible";
  if (prefs.excludedIngredientIds.includes(ingredientId)) return "aliment-exclu";
  if (!isOriginAllowed(prefs.diet, ing.animal)) return "regime";
  if (ing.allergens.some((a: Allergen) => prefs.allergens.includes(a))) return "allergene";
  return null;
}

/** Applique les contraintes dures et calcule les besoins de chaque recette pour `persons`. */
export function filterRecipes(prefs: Preferences, ctx: EngineContext): FilterResult {
  const candidates: PreparedRecipe[] = [];
  const rejected: FilterResult["rejected"] = [];

  for (const recipe of ctx.recipes) {
    const reasons = new Set<RejectionReason>();
    if (recipe.prepMinutes + recipe.cookMinutes > prefs.maxTotalMinutes) reasons.add("temps");
    if (recipe.difficulty > prefs.maxDifficulty) reasons.add("difficulte");
    if (!recipe.equipment.every((e) => prefs.equipment.includes(e))) reasons.add("equipement");

    const needs: Needs = new Map();
    const optionalNeeds: Needs = new Map();
    const droppedOptional: string[] = [];
    const portions = portionsPerMeal(prefs);
    const factor = portions / recipe.baseServings;
    const substituted: { from: string; to: string }[] = [];
    for (const line of recipe.ingredients) {
      const original = ctx.ingredients.get(line.ingredientId);
      const qty = original ? toBaseQuantity(line.quantity, line.unit, original) * factor : 0;
      // Substitution demandée : même unité de base, et ingrédient de remplacement autorisé.
      const sub = (prefs.substitutions ?? []).find((s) => s.recipeId === recipe.id && s.from === line.ingredientId);
      const target = sub ? ctx.ingredients.get(sub.to) : undefined;
      const useSub = !!sub && !!target && !!original && target.unit === original.unit && !ingredientViolation(sub.to, prefs, ctx);
      const ingredientId = useSub ? sub!.to : line.ingredientId;
      if (useSub) substituted.push({ from: line.ingredientId, to: sub!.to });
      const violation = ingredientViolation(ingredientId, prefs, ctx);
      const available = ctx.priceBook.has(ingredientId) || pantryQuantity(ctx.pantry.get(ingredientId)) >= qty;
      if (line.optional) {
        if (violation || !available) droppedOptional.push(ingredientId);
        else optionalNeeds.set(ingredientId, (optionalNeeds.get(ingredientId) ?? 0) + qty);
        continue;
      }
      if (violation) reasons.add(violation);
      else if (!available) reasons.add("indisponible");
      else needs.set(ingredientId, (needs.get(ingredientId) ?? 0) + qty);
    }

    if (reasons.size > 0) {
      rejected.push({ recipeId: recipe.id, reasons: [...reasons] });
      continue;
    }
    const facts = deriveRecipeFacts(recipe, ctx.ingredients);
    const nutrition = nutritionPerPortion(needs, ctx.ingredients, portions);
    candidates.push({
      recipe,
      needs,
      optionalNeeds,
      droppedOptional,
      score: scoreRecipe(recipe, needs, prefs, ctx) + nutritionBonus(nutrition, prefs.nutritionGoal),
      protein: facts.protein,
      base: facts.base,
      nutrition,
      baseIngredientId: facts.baseIngredientId,
      substituted,
      vegGrams: vegetableGrams(needs, ctx, portions),
      seasonal: (() => {
        const s = seasonality(needs, ctx);
        return s.inSeason > 0 && s.outOfSeason === 0;
      })(),
      maxCover: coverFor(recipe, portions),
      keepDays: keepDaysFor(recipe),
    });
  }
  return { candidates, rejected };
}

const EXPIRING_DAYS = 5;
/** Effet d'une note sur le score : 5 ★ très favorisée … 1 ★ quasiment écartée. */
export const RATING_BONUS: Record<number, number> = { 5: 5, 4: 3, 3: 0, 2: -5, 1: -12 };
/** Bonus par produit du placard (hors condiments) utilisé : les restes de paquets passent en priorité. */
export const LEFTOVER_BONUS = 1.5;
/** Saison : +1 par produit de saison (3 au plus), −1,5 par produit hors saison (2 au plus). */
export const SEASON_BONUS = 1;
export const OUT_OF_SEASON_PENALTY = 1.5;
/** Amplitude du bruit (graine) ajouté au score : assez pour varier, moins qu'un goût déclaré. */
export const SCORE_NOISE = 5;
/** Pénalité d'historique : dernier menu, avant-dernier, celui d'avant. */
export const HISTORY_PENALTIES = [8, 5, 2] as const;

/** Pénalité d'une recette selon sa position dans l'historique (la plus récente d'abord). */
export function historyPenalty(recipeId: string, recent: readonly string[], meals: number): number {
  const pos = recent.indexOf(recipeId);
  if (pos < 0) return 0;
  return HISTORY_PENALTIES[Math.floor(pos / Math.max(1, meals))] ?? 0;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/**
 * Score de préférence d'une recette (plus haut = mieux). Le coût n'y figure pas :
 * il est géré par l'optimiseur sous contrainte de budget.
 */
export function scoreRecipe(
  recipe: Recipe,
  needs: Needs,
  prefs: Pick<Preferences, "likedCuisines" | "favoriteIngredientIds" | "diet" | "seed"> &
    Partial<Pick<Preferences, "recentRecipeIds" | "meals" | "ratings">>,
  ctx: EngineContext,
): number {
  let score = 10;
  if (prefs.likedCuisines.includes(recipe.cuisine)) score += 4;
  const favs = [...needs.keys()].filter((id) => prefs.favoriteIngredientIds.includes(id)).length;
  score += Math.min(6, favs * 3);
  if (prefs.diet === "flexitarien" && [...needs.keys()].some((id) => ctx.ingredients.get(id)?.animal === "viande")) {
    score -= 3;
  }
  // Anti-gaspi : utiliser ce qui périme bientôt, et les restes de paquets du placard.
  let leftovers = 0;
  for (const id of needs.keys()) {
    const item = ctx.pantry.get(id);
    if (item?.expiresOn && daysBetween(ctx.today, item.expiresOn) <= EXPIRING_DAYS) score += 4;
    if (item && item.quantity !== null && item.quantity > 0 && !ctx.ingredients.get(id)?.staple) leftovers++;
  }
  score += LEFTOVER_BONUS * Math.min(3, leftovers);
  // Saison : fruits et légumes de saison favorisés (meilleurs, souvent moins chers), hors saison évités.
  const season = seasonality(needs, ctx);
  score += SEASON_BONUS * Math.min(3, season.inSeason) - OUT_OF_SEASON_PENALTY * Math.min(2, season.outOfSeason);
  // Vos notes : ce que vous avez aimé revient plus souvent, ce que vous n'avez pas aimé presque jamais.
  const stars = prefs.ratings?.[recipe.id];
  if (stars) score += RATING_BONUS[stars] ?? 0;
  // Plats proposés récemment : pénalisés, d'autant plus qu'ils sont récents.
  score -= historyPenalty(recipe.id, prefs.recentRecipeIds ?? [], prefs.meals ?? 1);
  // Bruit reproductible pour varier les menus d'une graine à l'autre.
  score += ((hashString(recipe.id, prefs.seed) % 1000) / 1000) * SCORE_NOISE;
  return score;
}

export interface RecipeCost {
  /** Coût en caisse si l'on cuisine cette recette seule (paquets entiers, placard déduit). */
  purchaseCents: number;
  /** Coût de la part réellement utilisée (indicatif). */
  usedCents: number;
  shoppingList: ShoppingList;
}

/** Coût d'une recette pour `persons` personnes. */
export function computeRecipeCost(recipe: Recipe, prefs: Preferences, ctx: EngineContext): RecipeCost | null {
  const prepared = filterRecipes(prefs, { ...ctx, recipes: [recipe] }).candidates[0];
  if (!prepared) return null;
  const list = buildShoppingList(prepared.needs, ctx);
  return { purchaseCents: list.totalCents, usedCents: list.usedCostCents, shoppingList: list };
}
