import { ProfileSchema } from "@/lib/domain/profile";
import { getCatalog } from "@/lib/server/catalog";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { getProfile, saveProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

export const GET = route(async () => getProfile(await getCurrentUserId()));

export const PUT = route(async (req: Request) => {
  const profile = await parseBody(req, ProfileSchema);
  const { ingredientsById } = await getCatalog();
  const unknown = profile.excludedIngredientIds.filter((id) => !ingredientsById.has(id));
  if (unknown.length) throw new HttpError(400, `Ingrédient inconnu : ${unknown.join(", ")}`);
  const userId = await getCurrentUserId();
  const clean = { ...profile, excludedIngredientIds: [...new Set(profile.excludedIngredientIds)] };
  await saveProfile(userId, clean);
  return clean;
});
