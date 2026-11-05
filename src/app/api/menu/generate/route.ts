import { GenerateRequestSchema } from "@/lib/domain/api";
import { optimizeMenu } from "@/lib/engine/optimize";
import { buildEngineContext } from "@/lib/server/catalog";
import { parseBody, route } from "@/lib/server/http";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { preferences, initial } = await parseBody(req, GenerateRequestSchema);
  const userId = await getCurrentUserId();
  const ctx = await buildEngineContext(userId, preferences);
  return optimizeMenu(preferences, ctx, { initial });
});
