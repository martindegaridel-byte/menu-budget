import { SwapRequestSchema } from "@/lib/domain/api";
import { swapOptions } from "@/lib/engine/optimize";
import { buildEngineContext } from "@/lib/server/catalog";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { preferences: raw, recipeIds, slot } = await parseBody(req, SwapRequestSchema);
  if (slot >= recipeIds.length) throw new HttpError(400, "Position de plat invalide");
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, raw);
  const ctx = await buildEngineContext(userId, preferences);
  return { options: swapOptions(recipeIds, slot, preferences, ctx) };
});
