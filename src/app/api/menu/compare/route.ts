import { EvaluateRequestSchema } from "@/lib/domain/api";
import { evaluateMenu } from "@/lib/engine/optimize";
import { buildEngineContext, listStores } from "@/lib/server/catalog";
import { parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

const MAX_STORES = 10;

/** Coût en caisse du même menu dans chacun de vos magasins (prix relevés ou estimations ajustées). */
export const POST = route(async (req: Request) => {
  const { preferences: raw, recipeIds } = await parseBody(req, EvaluateRequestSchema);
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, raw);
  const stores = (await listStores(userId)).slice(0, MAX_STORES);
  const rows = await Promise.all(
    stores.map(async (store) => {
      const prefs = { ...preferences, storeId: store.id };
      const result = evaluateMenu(recipeIds, prefs, await buildEngineContext(userId, prefs));
      const missing = result.shoppingList.unavailable.length;
      return { storeId: store.id, name: store.name, format: store.format, totalCents: result.totalCents, missing };
    }),
  );
  rows.sort((a, b) => a.missing - b.missing || a.totalCents - b.totalCents);
  return { stores: rows, currentStoreId: preferences.storeId ?? stores[0]?.id ?? null };
});
