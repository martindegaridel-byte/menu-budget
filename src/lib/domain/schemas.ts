import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Référentiels                                                        */
/* ------------------------------------------------------------------ */

export const BASE_UNITS = ["g", "ml", "piece"] as const;
export const BaseUnitSchema = z.enum(BASE_UNITS);
export type BaseUnit = z.infer<typeof BaseUnitSchema>;

/** Unités acceptées dans une recette (converties ensuite en unité de base). */
export const RECIPE_UNITS = ["g", "kg", "ml", "cl", "l", "piece", "cs", "cc"] as const;
export const RecipeUnitSchema = z.enum(RECIPE_UNITS);
export type RecipeUnit = z.infer<typeof RecipeUnitSchema>;

export const AISLES = {
  "fruits-legumes": "Fruits & légumes",
  boucherie: "Boucherie & volaille",
  charcuterie: "Charcuterie & traiteur",
  poissonnerie: "Poissonnerie",
  cremerie: "Crèmerie, œufs & fromages",
  vegetal: "Rayon végétal",
  "epicerie-salee": "Épicerie salée",
  "epicerie-sucree": "Épicerie sucrée & petit-déjeuner",
  conserves: "Conserves",
  monde: "Produits du monde",
  condiments: "Huiles, condiments & épices",
  boulangerie: "Pain & boulangerie",
  surgeles: "Surgelés",
} as const;
export const AisleSchema = z.enum(Object.keys(AISLES) as [keyof typeof AISLES, ...(keyof typeof AISLES)[]]);
export type Aisle = z.infer<typeof AisleSchema>;

/** Les 14 allergènes réglementaires (UE). */
export const ALLERGENS = {
  gluten: "Gluten",
  crustaces: "Crustacés",
  oeufs: "Œufs",
  poissons: "Poissons",
  arachides: "Arachides",
  soja: "Soja",
  lait: "Lait / lactose",
  "fruits-a-coque": "Fruits à coque",
  celeri: "Céleri",
  moutarde: "Moutarde",
  sesame: "Sésame",
  sulfites: "Sulfites",
  lupin: "Lupin",
  mollusques: "Mollusques",
} as const;
export const AllergenSchema = z.enum(Object.keys(ALLERGENS) as [keyof typeof ALLERGENS, ...(keyof typeof ALLERGENS)[]]);
export type Allergen = z.infer<typeof AllergenSchema>;

/** Origine animale d'un ingrédient — sert à dériver le régime d'une recette. */
export const AnimalOriginSchema = z.enum(["viande", "poisson", "fruits-de-mer", "oeuf", "laitier", "miel"]);
export type AnimalOrigin = z.infer<typeof AnimalOriginSchema>;

export const DIETS = {
  omnivore: "Omnivore",
  flexitarien: "Flexitarien (peu de viande)",
  pescetarien: "Pescétarien",
  vegetarien: "Végétarien",
  vegan: "Vegan",
} as const;
export const DietSchema = z.enum(Object.keys(DIETS) as [keyof typeof DIETS, ...(keyof typeof DIETS)[]]);
export type Diet = z.infer<typeof DietSchema>;

export const EQUIPMENT = {
  plaques: "Plaques de cuisson",
  four: "Four",
  "micro-ondes": "Micro-ondes",
  mixeur: "Mixeur",
} as const;
export const EquipmentSchema = z.enum(Object.keys(EQUIPMENT) as [keyof typeof EQUIPMENT, ...(keyof typeof EQUIPMENT)[]]);
export type Equipment = z.infer<typeof EquipmentSchema>;

export const CUISINES = {
  francaise: "Française",
  italienne: "Italienne",
  asiatique: "Asiatique",
  indienne: "Indienne",
  mexicaine: "Mexicaine",
  orientale: "Orientale",
  mediterraneenne: "Méditerranéenne",
  americaine: "Américaine",
  espagnole: "Espagnole",
  africaine: "Africaine",
  antillaise: "Antillaise",
  japonaise: "Japonaise",
  coreenne: "Coréenne",
  vietnamienne: "Vietnamienne",
  libanaise: "Libanaise",
  grecque: "Grecque",
  portugaise: "Portugaise",
  turque: "Turque",
} as const;
export const CuisineSchema = z.enum(Object.keys(CUISINES) as [keyof typeof CUISINES, ...(keyof typeof CUISINES)[]]);
export type Cuisine = z.infer<typeof CuisineSchema>;

export const DifficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Difficulty = z.infer<typeof DifficultySchema>;

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "identifiant kebab-case attendu");
const cents = z.number().int().nonnegative();
const positive = z.number().positive();

/* ------------------------------------------------------------------ */
/* Ingrédients & conditionnements                                     */
/* ------------------------------------------------------------------ */

export const NutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

/** Objectif nutritionnel privilégié par le moteur (sans jamais dépasser le budget). */
export const NUTRITION_GOALS = {
  aucun: "Aucun",
  proteine: "Riche en protéines",
  equilibre: "Équilibré",
} as const;
export const NutritionGoalSchema = z.enum(Object.keys(NUTRITION_GOALS) as [keyof typeof NUTRITION_GOALS, ...(keyof typeof NUTRITION_GOALS)[]]);
export type NutritionGoal = z.infer<typeof NutritionGoalSchema>;

export const IngredientSchema = z.object({
  id,
  name: z.string().min(2),
  aisle: AisleSchema,
  unit: BaseUnitSchema,
  /** Poids moyen d'une pièce (pour « 2 oignons »), si l'unité de base est g. */
  gramsPerPiece: positive.optional(),
  animal: AnimalOriginSchema.nullable().default(null),
  allergens: z.array(AllergenSchema).default([]),
  /** Condiment/épice : se gère en « présent / absent » dans le placard. */
  staple: z.boolean().default(false),
  /** Familles pour les exclusions rapides (porc, champignon, fromage, piquant…). */
  tags: z.array(z.string()).default([]),
  /**
   * Valeurs nutritionnelles moyennes (estimations, ordre de grandeur Ciqual) :
   * pour 100 g / 100 ml, ou pour 1 pièce si l'unité de base est « piece ».
   */
  nutrition: NutritionSchema.optional(),
  /** Mois de pleine saison en France (1–12), pour les produits frais de saison. */
  season: z.array(z.number().int().min(1).max(12)).optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const PriceSourceSchema = z.enum(["estimate", "manual", "import", "openprices"]);
export type PriceSource = z.infer<typeof PriceSourceSchema>;

/** Un conditionnement réel vendu en magasin (on achète le paquet entier). */
export const PackageSchema = z.object({
  id: z.string().min(1),
  ingredientId: id,
  label: z.string().min(1),
  brand: z.string().optional(),
  /** Quantité contenue, en unité de base de l'ingrédient. */
  quantity: positive,
  priceCents: cents,
  source: PriceSourceSchema,
  /** Date du relevé / de l'estimation (ISO). */
  asOf: z.string(),
});
export type Package = z.infer<typeof PackageSchema>;

/* ------------------------------------------------------------------ */
/* Magasins                                                           */
/* ------------------------------------------------------------------ */

export const StoreFormatSchema = z.enum(["hyper", "super", "contact", "express", "discount", "autre"]);
export type StoreFormat = z.infer<typeof StoreFormatSchema>;

export const StoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  chain: z.string().min(1),
  format: StoreFormatSchema,
  city: z.string().optional(),
  /**
   * Indice de prix appliqué aux estimations de l'enseigne de référence
   * (100 = identique). Les prix saisis par l'utilisateur ne sont pas affectés.
   */
  priceIndex: z.number().int().min(50).max(200).default(100),
});
export type Store = z.infer<typeof StoreSchema>;

/* ------------------------------------------------------------------ */
/* Recettes                                                           */
/* ------------------------------------------------------------------ */

export const RecipeIngredientSchema = z.object({
  ingredientId: id,
  quantity: positive,
  unit: RecipeUnitSchema,
  optional: z.boolean().default(false),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id,
  name: z.string().min(2),
  description: z.string().default(""),
  cuisine: CuisineSchema,
  baseServings: z.number().int().positive(),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  difficulty: DifficultySchema,
  equipment: z.array(EquipmentSchema).min(1),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(RecipeIngredientSchema).min(1),
  steps: z.array(z.string().min(3)).min(1),
  source: z.enum(["seed", "llm", "user"]).default("seed"),
  /* Conservation (facultatif ; affichée seulement, pas encore utilisée par le moteur). */
  /** Nombre de portions qu'on prépare habituellement en une fois. */
  portions: z.number().int().min(1).max(20).optional(),
  /** Durée de conservation au réfrigérateur, en jours. */
  fridgeDays: z.number().int().min(0).max(14).optional(),
  /** Se congèle bien. */
  freezable: z.boolean().optional(),
  /** Se réchauffe bien (sinon : à manger le jour même). */
  reheats: z.boolean().optional(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/* ------------------------------------------------------------------ */
/* Placard (stock utilisateur)                                        */
/* ------------------------------------------------------------------ */

export const PantryItemSchema = z.object({
  ingredientId: id,
  /** Quantité en unité de base ; `null` = « j'en ai, en quantité suffisante » (condiments). */
  quantity: z.number().nonnegative().nullable(),
  /** Date de péremption (AAAA-MM-JJ), facultative. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PantryItem = z.infer<typeof PantryItemSchema>;

/* ------------------------------------------------------------------ */
/* Préférences utilisateur                                            */
/* ------------------------------------------------------------------ */

export const PreferencesSchema = z.object({
  /** Budget total pour la période, en centimes. */
  budgetCents: cents.max(1_000_000),
  /** Nombre de repas (1 repas = 1 plat) à composer. */
  meals: z.number().int().min(1).max(21),
  persons: z.number().int().min(1).max(12),
  diet: DietSchema.default("omnivore"),
  allergens: z.array(AllergenSchema).default([]),
  excludedIngredientIds: z.array(id).default([]),
  maxTotalMinutes: z.number().int().min(5).max(300).default(60),
  maxDifficulty: DifficultySchema.default(3),
  equipment: z.array(EquipmentSchema).default(["plaques", "four", "micro-ondes", "mixeur"]),
  likedCuisines: z.array(CuisineSchema).default([]),
  favoriteIngredientIds: z.array(id).default([]),
  /** Utiliser le placard de l'utilisateur pour réduire le coût. */
  usePantry: z.boolean().default(true),
  storeId: z.string().optional(),
  /** Graine pour varier les propositions de façon reproductible. */
  seed: z.number().int().nonnegative().default(0),
  /**
   * Recettes proposées récemment, la plus récente d'abord (rempli par l'appli) :
   * le moteur les pénalise pour éviter de reproposer les mêmes plats.
   */
  recentRecipeIds: z.array(id).max(63).default([]),
  /** Objectif nutritionnel : privilégier les plats riches en protéines ou équilibrés. */
  nutritionGoal: NutritionGoalSchema.default("aucun"),
  /**
   * Batch cooking : cuisiner une fois pour plusieurs soirs (plats qui se gardent et se
   * réchauffent) et mutualiser les bases (riz, pâtes…) entre les plats.
   */
  batchCooking: z.boolean().default(false),
  /** Notes de l'utilisateur (recette → 1 à 5 étoiles), ajoutées côté serveur. */
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  /** Ingrédients remplacés dans un plat (« dans ce plat, poireau → courgette »). */
  substitutions: z.array(z.object({ recipeId: id, from: id, to: id })).max(60).default([]),
  /** Portions en plus cuisinées le soir pour le lendemain midi (0 = aucune). */
  lunchPortions: z.number().int().min(0).max(12).default(0),
  /** Mode « fin de mois » : le menu le moins cher possible (placard d'abord). */
  cheapestMode: z.boolean().default(false),
  /** Desserts à prévoir sur la période (compris dans le budget). */
  desserts: z.number().int().min(0).max(14).default(0),
  /** Petits-déjeuners à prévoir sur la période (compris dans le budget). */
  breakfasts: z.number().int().min(0).max(14).default(0),
  /** Batch cooking : durée maximale de la session de préparation (minutes). */
  batchSessionMinutes: z.number().int().min(60).max(360).default(180),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export type PreferencesInput = z.input<typeof PreferencesSchema>;
