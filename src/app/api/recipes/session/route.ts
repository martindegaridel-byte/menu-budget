import { z } from "zod";
import { getCatalog } from "@/lib/server/catalog";
import { HttpError, route } from "@/lib/server/http";
import { recipeStepsFor } from "@/lib/server/recipeSteps";

const ItemsSchema = z
  .array(z.object({ id: z.string().min(1).max(100), persons: z.number().int().min(1).max(48) }))
  .min(1)
  .max(14);

/** Étapes des plats d'une session de batch cooking : GET /api/recipes/session?items=id:portions,id:portions */
export const GET = route(async (req: Request) => {
  const raw = new URL(req.url).searchParams.get("items") ?? "";
  const items = ItemsSchema.parse(
    raw.split(",").filter(Boolean).map((s) => {
      const [id, p] = s.split(":");
      return { id, persons: Number(p) };
    }),
  );
  const catalog = await getCatalog();
  const dishes = items.map(({ id, persons }) => {
    const recipe = catalog.recipes.find((r) => r.id === id);
    if (!recipe) throw new HttpError(404, `Recette inconnue : ${id}`);
    return { id, name: recipe.name, cookMinutes: recipe.cookMinutes, ...recipeStepsFor(recipe, persons, catalog) };
  });
  return { dishes };
});
