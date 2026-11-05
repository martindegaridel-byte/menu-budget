import { GenerateRequestSchema } from "@/lib/domain/api";
import { optimizeMenu } from "@/lib/engine/optimize";
import { buildEngineContext } from "@/lib/server/catalog";
import { parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

export const POST = route(async (req: Request) => {
  const { preferences: raw, initial } = await parseBody(req, GenerateRequestSchema);
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, raw);
  const ctx = await buildEngineContext(userId, preferences);
  return optimizeMenu(preferences, ctx, { initial });
});
