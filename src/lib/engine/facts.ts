import type { Allergen, Diet, Ingredient, Recipe } from "@/lib/domain/schemas";
import { compatibleDiets } from "./diet";
import { toBaseQuantity } from "./units";

/**
 * Faits d'une recette DÉDUITS de ses ingrédients (jamais saisis à la main) :
 * régime, allergènes, « rapide », base féculente et protéine principale.
 */

/** Durée maximale (préparation + cuisson) d'un plat « rapide ». */
export const QUICK_MINUTES = 25;

export const BASES = {
  pates: "Pâtes",
  riz: "Riz",
  "pommes-de-terre": "Pommes de terre",
  cereales: "Semoule, boulgour, quinoa",
  pain: "Pain, galettes",
  pate: "Tarte, pizza, crêpes",
  legumineuses: "Légumineuses",
} as const;
export type Base = keyof typeof BASES;

export type Protein =
  | "boeuf"
  | "porc"
  | "volaille"
  | "agneau"
  | "veau"
  | "poisson"
  | "fruits-de-mer"
  | "proteine-vegetale"
  | "legumineuses"
  | "oeufs"
  | "fromage";

export interface RecipeFacts {
  /** Régime le plus strict compatible (vegan ⊂ végétarien ⊂ pescétarien ⊂ omnivore). */
  diet: Diet;
  allergens: Allergen[];
  quick: boolean;
  glutenFree: boolean;
  base: Base | null;
  /** Ingrédient qui sert de base (ex. « riz-long ») : utile pour mutualiser sa cuisson. */
  baseIngredientId: string | null;
  protein: Protein | null;
}

/** Quantité minimale par portion pour qu'un ingrédient compte comme base ou protéine (g). */
const MIN_GRAMS_PER_SERVING = 30;
const DEFAULT_PIECE_GRAMS = 200;

const MEAT_TAGS = ["boeuf", "porc", "volaille", "agneau", "veau"] as const;

function proteinOf(ing: Ingredient): { protein: Protein; rank: number } | null {
  const meat = MEAT_TAGS.find((t) => ing.tags.includes(t));
  if (meat && ing.animal === "viande") return { protein: meat, rank: 0 };
  if (ing.animal === "poisson") return { protein: "poisson", rank: 0 };
  if (ing.animal === "fruits-de-mer") return { protein: "fruits-de-mer", rank: 0 };
  if (ing.tags.includes("proteine-vegetale")) return { protein: "proteine-vegetale", rank: 1 };
  if (ing.tags.includes("base:legumineuses")) return { protein: "legumineuses", rank: 1 };
  if (ing.animal === "oeuf" && ing.unit === "piece") return { protein: "oeufs", rank: 1 };
  if (ing.tags.includes("fromage")) return { protein: "fromage", rank: 3 };
  return null;
}

function baseOf(ing: Ingredient): Base | null {
  const tag = ing.tags.find((t) => t.startsWith("base:"));
  const b = tag?.slice(5);
  return b && b in BASES ? (b as Base) : null;
}

const DIET_ORDER: Diet[] = ["vegan", "vegetarien", "pescetarien", "omnivore"];

export function deriveRecipeFacts(recipe: Recipe, ingredients: ReadonlyMap<string, Ingredient>): RecipeFacts {
  const essentials = recipe.ingredients.filter((l) => !l.optional);
  const lines = essentials.flatMap((l) => {
    const ing = ingredients.get(l.ingredientId);
    if (!ing) return [];
    let qty: number;
    try {
      qty = toBaseQuantity(l.quantity, l.unit, ing);
    } catch {
      return [];
    }
    const grams = ing.unit === "piece" ? qty * (ing.gramsPerPiece ?? (ing.animal === "oeuf" ? 60 : DEFAULT_PIECE_GRAMS)) : qty;
    return [{ ing, perServing: grams / recipe.baseServings }];
  });

  const diets = compatibleDiets(lines.map((l) => l.ing.animal));
  const diet = DIET_ORDER.find((d) => diets.includes(d)) ?? "omnivore";
  const allergens = [...new Set(lines.flatMap((l) => l.ing.allergens))].sort();

  const significant = lines.filter((l) => l.perServing >= MIN_GRAMS_PER_SERVING);
  const pickLargest = <T,>(items: { value: T; rank: number; perServing: number }[]) =>
    items.sort((a, b) => a.rank - b.rank || b.perServing - a.perServing)[0]?.value ?? null;

  // Base : féculent le plus présent ; les légumineuses ne servent de base qu'en l'absence de féculent.
  const baseLine = pickLargest(
    significant.flatMap((l) => {
      const b = baseOf(l.ing);
      return b ? [{ value: { base: b, id: l.ing.id }, rank: b === "legumineuses" ? 1 : 0, perServing: l.perServing }] : [];
    }),
  );
  const base = baseLine?.base ?? null;
  const protein = pickLargest(
    significant.flatMap((l) => {
      const p = proteinOf(l.ing);
      return p ? [{ value: p.protein, rank: p.rank, perServing: l.perServing }] : [];
    }),
  );

  return {
    diet,
    allergens,
    quick: recipe.prepMinutes + recipe.cookMinutes <= QUICK_MINUTES,
    glutenFree: !allergens.includes("gluten"),
    base,
    baseIngredientId: baseLine?.id ?? null,
    protein,
  };
}

/** Étiquettes affichables calculées (« rapide », « vegan », « sans-gluten »…). */
export function derivedTags(f: RecipeFacts): string[] {
  const tags: string[] = [];
  if (f.quick) tags.push("rapide");
  if (f.diet === "vegan") tags.push("vegan");
  if (f.diet === "vegan" || f.diet === "vegetarien") tags.push("vegetarien");
  if (f.glutenFree) tags.push("sans-gluten");
  if (f.protein) tags.push(f.protein);
  return tags;
}

/** Étiquettes qu'une recette ne doit jamais porter à la main : elles sont calculées. */
export const DERIVED_TAG_NAMES = new Set([
  "rapide",
  "vegan",
  "vegetarien",
  "sans-gluten",
  "sans-lactose",
  "pescetarien",
  "poisson",
  "porc",
  "poulet",
  "boeuf",
  "volaille",
  "oeufs",
  "fruits-de-mer",
  "agneau",
  "veau",
  "fromage",
]);
