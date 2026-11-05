import {
  IngredientSchema,
  PackageSchema,
  PantryItemSchema,
  RecipeSchema,
  StoreSchema,
  type Ingredient,
  type Package,
  type PantryItem,
  type Preferences,
  type Recipe,
  type Store,
} from "@/lib/domain/schemas";
import type { EngineContext } from "@/lib/engine/types";
import { resolvePriceBook, type PriceProvider } from "@/lib/pricing/priceBook";
import { prisma } from "./db";

export const DEFAULT_STORE_ID = "intermarche-super";
export const REFERENCE_CHAIN = "intermarche";

interface Catalog {
  ingredients: Ingredient[];
  ingredientsById: Map<string, Ingredient>;
  recipes: Recipe[];
  referencePackages: Package[];
  loadedAt: number;
}

let catalogCache: Catalog | null = null;
const CATALOG_TTL_MS = 60_000;

const json = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function toPackage(p: {
  id: string;
  ingredientId: string;
  label: string;
  brand: string | null;
  quantity: number;
  priceCents: number;
  source: string;
  asOf: string;
}): Package {
  return PackageSchema.parse({ ...p, brand: p.brand ?? undefined });
}

/** Ingrédients, recettes et prix de référence (mis en cache 60 s). */
export async function getCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) return catalogCache;
  const [ingRows, recipeRows, pkgRows] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    prisma.recipe.findMany({ include: { ingredients: { orderBy: { position: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.package.findMany({ where: { userId: null, storeId: null, chain: REFERENCE_CHAIN } }),
  ]);
  const ingredients = ingRows.map((i) =>
    IngredientSchema.parse({
      ...i,
      gramsPerPiece: i.gramsPerPiece ?? undefined,
      allergens: json(i.allergensJson, []),
      tags: json(i.tagsJson, []),
    }),
  );
  const recipes = recipeRows.map((r) =>
    RecipeSchema.parse({
      ...r,
      equipment: json(r.equipmentJson, []),
      tags: json(r.tagsJson, []),
      steps: json(r.stepsJson, []),
      ingredients: r.ingredients.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        optional: l.optional,
      })),
    }),
  );
  catalogCache = {
    ingredients,
    ingredientsById: new Map(ingredients.map((i) => [i.id, i])),
    recipes,
    referencePackages: pkgRows.map(toPackage),
    loadedAt: Date.now(),
  };
  return catalogCache;
}

export function invalidateCatalog() {
  catalogCache = null;
}

/** Magasins visibles par l'utilisateur : magasins par défaut + les siens. */
export async function listStores(userId: string): Promise<Store[]> {
  const rows = await prisma.store.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((s) => StoreSchema.parse({ ...s, city: s.city ?? undefined }));
}

export async function getStore(userId: string, storeId: string | undefined): Promise<Store> {
  const stores = await listStores(userId);
  return stores.find((s) => s.id === storeId) ?? stores.find((s) => s.id === DEFAULT_STORE_ID) ?? stores[0]!;
}

/** Fournisseur de prix Prisma : estimations Intermarché + prix utilisateur du magasin. */
export const prismaPriceProvider: PriceProvider = {
  async getPriceBook({ storeId, userId }) {
    const catalog = await getCatalog();
    const store = userId ? await getStore(userId, storeId) : { priceIndex: 100 };
    const [own, unavailable] = userId
      ? await Promise.all([
          prisma.package.findMany({ where: { storeId, userId } }),
          prisma.unavailableIngredient.findMany({ where: { storeId, userId } }),
        ])
      : [[], []];
    return resolvePriceBook({
      referencePackages: catalog.referencePackages,
      store,
      storePackages: own.map(toPackage),
      unavailableIngredientIds: unavailable.map((u) => u.ingredientId),
    });
  },
};

export async function getPantry(userId: string): Promise<PantryItem[]> {
  const rows = await prisma.pantryItem.findMany({ where: { userId } });
  return rows.map((r) =>
    PantryItemSchema.parse({ ingredientId: r.ingredientId, quantity: r.quantity, expiresOn: r.expiresOn ?? undefined }),
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Construit le contexte moteur pour l'utilisateur et ses préférences. */
export async function buildEngineContext(userId: string, prefs: Preferences): Promise<EngineContext> {
  const store = await getStore(userId, prefs.storeId);
  const [catalog, priceBook, pantry] = await Promise.all([
    getCatalog(),
    prismaPriceProvider.getPriceBook({ storeId: store.id, userId }),
    prefs.usePantry ? getPantry(userId) : Promise.resolve([]),
  ]);
  return {
    ingredients: catalog.ingredientsById,
    recipes: catalog.recipes,
    priceBook,
    pantry: new Map(pantry.map((p) => [p.ingredientId, p])),
    today: todayIso(),
  };
}
