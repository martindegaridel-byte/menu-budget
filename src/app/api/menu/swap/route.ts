import { SwapRequestSchema } from "@/lib/domain/api";
import { swapOptions } from "@/lib/engine/optimize";
import { buildEngineContext } from "@/lib/server/catalog";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { preferences, recipeIds, slot } = await parseBody(req, SwapRequestSchema);
  if (slot >= recipeIds.length) throw new HttpError(400, "Position de plat invalide");
  const ctx = await buildEngineContext(await getCurrentUserId(), preferences);
  return { options: swapOptions(recipeIds, slot, preferences, ctx) };
});
