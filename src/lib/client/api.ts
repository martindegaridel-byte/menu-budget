import type { Profile } from "@/lib/domain/profile";
import type { BarcodeMatch } from "@/lib/pricing/barcode";
import type { PriceChange } from "@/lib/pricing/priceChanges";
import type { PantryItem, PreferencesInput, Store } from "@/lib/domain/schemas";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import type { PantrySuggestion } from "@/lib/engine/suggest";

export class ApiError extends Error {}

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`);
  return data as T;
}

export interface SavedMenuSummary {
  id: string;
  name: string;
  favorite: boolean;
  totalCents: number;
  budgetCents: number;
  /** Montant réellement payé, si saisi. */
  actualCents: number | null;
  createdAt: string;
  persons: number;
  /** Portions servies (repas × personnes, midis compris). */
  portions: number;
  /** Valeur des ingrédients pris dans le placard. */
  pantrySavingsCents: number;
  recipeNames: string[];
}

export interface OpenPricesImport {
  location: { id: number; name: string; url: string; priceCount: number };
  since: string;
  fetched: number;
  imported: number;
  matchedIngredients: number;
  totalIngredients: number;
  rejectedAsImplausible: number;
  ignoredExpensive: number;
  /** Variations d'au moins 10 % depuis l'import précédent. */
  priceChanges: PriceChange[];
  items: OpenPricesItem[];
}
export interface OpenPricesItem {
  ingredientId: string;
  ingredientName: string;
  ratio: number | null;
  packages: { label: string; priceCents: number; asOf: string }[];
}

export const api = {
  generate: (preferences: PreferencesInput, initial?: string[]) =>
    call<MenuResult>("/api/menu/generate", { body: { preferences, initial } }),
  evaluate: (preferences: PreferencesInput, recipeIds: string[]) =>
    call<MenuResult>("/api/menu/evaluate", { body: { preferences, recipeIds } }),
  compareStores: (preferences: PreferencesInput, recipeIds: string[]) =>
    call<{ stores: { storeId: string; name: string; format: string; totalCents: number; missing: number }[]; currentStoreId: string | null }>(
      "/api/menu/compare",
      { body: { preferences, recipeIds } },
    ),
  exportData: () => call<Record<string, unknown>>("/api/export"),
  importData: (backup: unknown) =>
    call<{ imported: { stores: number; prices: number; pantry: number; menus: number; favorites: number; ratings: number } }>("/api/import", { body: backup }),
  sessionSteps: (items: { id: string; persons: number }[]) =>
    call<{ dishes: { id: string; name: string; cookMinutes: number; prep: string[]; steps: string[] }[] }>(
      `/api/recipes/session?items=${encodeURIComponent(items.map((i) => `${i.id}:${i.persons}`).join(","))}`,
    ),
  swap: (preferences: PreferencesInput, recipeIds: string[], slot: number) =>
    call<{ options: SwapOption[] }>("/api/menu/swap", { body: { preferences, recipeIds, slot } }),
  saveMenu: (preferences: PreferencesInput, recipeIds: string[], favorite = false) =>
    call<{ id: string }>("/api/menus", { body: { preferences, recipeIds, favorite } }),
  listMenus: () => call<{ menus: SavedMenuSummary[] }>("/api/menus"),
  getMenu: (id: string) =>
    call<{ id: string; name: string; preferences: PreferencesInput; result: MenuResult }>(`/api/menus/${id}`),
  updateMenu: (id: string, data: { name?: string; favorite?: boolean; actualCents?: number | null }) =>
    call(`/api/menus/${id}`, { method: "PATCH", body: data }),
  deleteMenu: (id: string) => call(`/api/menus/${id}`, { method: "DELETE" }),
  getPantry: () => call<{ items: PantryItem[] }>("/api/pantry"),
  putPantry: (items: PantryItem[]) => call<{ items: PantryItem[] }>("/api/pantry", { method: "PUT", body: { items } }),
  listStores: () => call<{ stores: Store[]; formatPriceIndex: Record<string, number> }>("/api/stores"),
  createStore: (s: { name: string; chain: string; format: Store["format"]; city?: string; priceIndex?: number }) =>
    call<{ id: string }>("/api/stores", { body: s }),
  updateStore: (id: string, s: Partial<Pick<Store, "name" | "chain" | "format" | "city" | "priceIndex">>) =>
    call(`/api/stores/${id}`, { method: "PATCH", body: s }),
  deleteStore: (id: string) => call(`/api/stores/${id}`, { method: "DELETE" }),
  getPrices: (storeId: string) =>
    call<{
      store: Store;
      prices: Record<string, { id: string; label: string; quantity: number; priceCents: number; source: string; asOf: string }[]>;
      unavailable: string[];
    }>(`/api/prices?storeId=${encodeURIComponent(storeId)}`),
  setPrice: (p: { storeId: string; ingredientId: string; label: string; quantity: number; priceCents: number }) =>
    call("/api/prices", { body: p }),
  deletePrice: (packageId: string) => call("/api/prices", { method: "DELETE", body: { packageId } }),
  importPrices: (storeId: string, csv: string) =>
    call<{ imported: number; errors: { line: number; message: string }[] }>("/api/prices/import", { body: { storeId, csv } }),
  importOpenPrices: (storeId: string, location: string) =>
    call<OpenPricesImport>("/api/prices/openprices", { body: { storeId, location } }),
  setUnavailable: (storeId: string, ingredientId: string, unavailable: boolean) =>
    call("/api/prices/unavailable", { body: { storeId, ingredientId, unavailable } }),
  generateRecipes: (preferences: PreferencesInput, count = 2) =>
    call<{ recipes: { id: string; name: string; purchaseCents: number; usedCents: number }[]; rejected: { name: string; reason: string }[] }>(
      "/api/recipes/generate",
      { body: { preferences, count } },
    ),
  suggestFromPantry: (preferences: PreferencesInput, ingredientIds: string[]) =>
    call<{ suggestions: PantrySuggestion[] }>("/api/recipes/suggest", { body: { preferences, ingredientIds } }),
  barcode: (code: string) => call<BarcodeMatch>(`/api/barcode/${encodeURIComponent(code)}`),
  getProfile: () => call<Profile>("/api/profile"),
  putProfile: (profile: Profile) => call<Profile>("/api/profile", { method: "PUT", body: profile }),
  ratings: () => call<{ ratings: { recipeId: string; stars: number; note: string }[] }>("/api/ratings"),
  rateRecipe: (recipeId: string, stars: number | null, note?: string) => call<{ ok: true }>("/api/ratings", { method: "PUT", body: { recipeId, stars, note } }),
  favorites: () => call<{ recipeIds: string[] }>("/api/favorites"),
  setFavorite: (recipeId: string, favorite: boolean) => call("/api/favorites", { body: { recipeId, favorite } }),
};
