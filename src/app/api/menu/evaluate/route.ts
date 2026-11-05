import { EvaluateRequestSchema } from "@/lib/domain/api";
import { evaluateMenu } from "@/lib/engine/optimize";
import { buildEngineContext } from "@/lib/server/catalog";
import { parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { preferences, recipeIds } = await parseBody(req, EvaluateRequestSchema);
  const ctx = await buildEngineContext(await getCurrentUserId(), preferences);
  return evaluateMenu(recipeIds, preferences, ctx);
});
