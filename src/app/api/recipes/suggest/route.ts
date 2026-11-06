import { SuggestRequestSchema } from "@/lib/domain/api";
import { suggestFromPantry } from "@/lib/engine/suggest";
import { buildEngineContext } from "@/lib/server/catalog";
import { parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

/** « Que faire avec ce que j'ai ? » : recettes compatibles qui utilisent les ingrédients choisis. */
export const POST = route(async (req: Request) => {
  const { preferences: raw, ingredientIds } = await parseBody(req, SuggestRequestSchema);
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, { ...raw, usePantry: true });
  const ctx = await buildEngineContext(userId, preferences);
  return { suggestions: suggestFromPantry(preferences, ctx, ingredientIds) };
});
