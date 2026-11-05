import type { PantryItem, PreferencesInput, Store } from "@/lib/domain/schemas";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";

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
  createdAt: string;
  persons: number;
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
  swap: (preferences: PreferencesInput, recipeIds: string[], slot: number) =>
    call<{ options: SwapOption[] }>("/api/menu/swap", { body: { preferences, recipeIds, slot } }),
  saveMenu: (preferences: PreferencesInput, recipeIds: string[], favorite = false) =>
    call<{ id: string }>("/api/menus", { body: { preferences, recipeIds, favorite } }),
  listMenus: () => call<{ menus: SavedMenuSummary[] }>("/api/menus"),
  getMenu: (id: string) =>
    call<{ id: string; name: string; preferences: PreferencesInput; result: MenuResult }>(`/api/menus/${id}`),
  updateMenu: (id: string, data: { name?: string; favorite?: boolean }) =>
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
  favorites: () => call<{ recipeIds: string[] }>("/api/favorites"),
  setFavorite: (recipeId: string, favorite: boolean) => call("/api/favorites", { body: { recipeId, favorite } }),
};
