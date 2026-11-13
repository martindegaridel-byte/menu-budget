import {
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
import { loadSeedData } from "@/lib/data/seed";
import { indexUnobserved, resolvePriceBook, scaleToObserved, type PriceProvider } from "@/lib/pricing/priceBook";
import { prisma } from "./db";

export const DEFAULT_STORE_ID = "super-u-saint-pierre";
export const REFERENCE_CHAIN = "intermarche";
/** Magasin de l'enseigne de référence (ses relevés servent de repli aux autres magasins proposés). */
export const REFERENCE_STORE_ID = "intermarche-super";

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

export function toPackage(p: {
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

/**
 * Ingrédients, recettes et prix de référence (mis en cache 60 s).
 * Le catalogue de base vient des fichiers data/ inclus dans l'appli (déjà en mémoire,
 * validés par Zod) : la base n'est interrogée que pour les recettes ajoutées ensuite
 * (IA, recettes personnelles). Bien plus rapide en ligne, surtout au démarrage.
 */
export async function getCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) return catalogCache;
  const data = loadSeedData();
  const extraRows = await prisma.recipe.findMany({
    where: { source: { not: "seed" } },
    include: { ingredients: { orderBy: { position: "asc" } } },
  });
  const extra = extraRows.flatMap((r) => {
    const parsed = RecipeSchema.safeParse({
      ...r,
      equipment: json(r.equipmentJson, []),
      tags: json(r.tagsJson, []),
      steps: json(r.stepsJson, []),
      portions: r.portions ?? undefined,
      fridgeDays: r.fridgeDays ?? undefined,
      freezable: r.freezable ?? undefined,
      reheats: r.reheats ?? undefined,
      ingredients: r.ingredients.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, optional: l.optional })),
    });
    return parsed.success ? [parsed.data] : [];
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr");
  const ingredients = [...data.ingredients].sort(byName);
  const seedIds = new Set(data.recipes.map((r) => r.id));
  const recipes = [...data.recipes, ...extra.filter((r) => !seedIds.has(r.id))].sort(byName);
  catalogCache = {
    ingredients,
    ingredientsById: new Map(ingredients.map((i) => [i.id, i])),
    recipes,
    referencePackages: data.packages,
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
    // Prix réels partagés pour ce magasin (relevés Open Prices) ; vos propres prix d'un ingrédient passent avant.
    const mine = own.map(toPackage);
    const mineIds = new Set(mine.map((p) => p.ingredientId));
    // Un magasin proposé à tous sans relevé pour un ingrédient reprend le niveau réel de l'enseigne de référence.
    const observed = loadSeedData().storePrices;
    const storeObserved = observed[storeId] ?? [];
    const ownIds = new Set(storeObserved.map((p) => p.ingredientId));
    const fallback = storeId in observed && storeId !== REFERENCE_STORE_ID ? (observed[REFERENCE_STORE_ID] ?? []).filter((p) => !ownIds.has(p.ingredientId)) : [];
    const allObserved = [...storeObserved, ...fallback];
    const shared = scaleToObserved(catalog.referencePackages, allObserved).filter((p) => !mineIds.has(p.ingredientId));
    // Sans relevé pour un ingrédient : estimation recalée sur le niveau constaté dans son rayon.
    const sharedIds = new Set(shared.map((p) => p.ingredientId));
    const indexed = indexUnobserved(catalog.referencePackages, allObserved, (id) => catalog.ingredientsById.get(id)?.aisle).filter(
      (p) => !mineIds.has(p.ingredientId) && !sharedIds.has(p.ingredientId),
    );
    return resolvePriceBook({
      referencePackages: catalog.referencePackages,
      store,
      storePackages: [...shared, ...indexed, ...mine],
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
