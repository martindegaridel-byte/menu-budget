import { z } from "zod";
import { PreferencesSchema } from "@/lib/domain/schemas";
import { isOriginAllowed } from "@/lib/engine/diet";
import { computeRecipeCost } from "@/lib/engine/recipes";
import { AnthropicRecipeGenerator, isRecipeGeneratorEnabled } from "@/lib/llm/anthropic";
import { buildEngineContext, getCatalog, invalidateCatalog } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

const BodySchema = z.object({ preferences: PreferencesSchema, count: z.number().int().min(1).max(4).default(2) });

/** Génère de nouvelles recettes par LLM ; leur coût est recalculé par le moteur. */
export const POST = route(async (req: Request) => {
  if (!isRecipeGeneratorEnabled()) throw new HttpError(404, "Génération de recettes désactivée (RECIPE_GENERATOR_ENABLED).");
  const { preferences: raw, count } = await parseBody(req, BodySchema);
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, raw);
  const [catalog, ctx] = await Promise.all([getCatalog(), buildEngineContext(userId, preferences)]);
  const allowedIngredients = catalog.ingredients.filter(
    (i) =>
      ctx.priceBook.has(i.id) &&
      isOriginAllowed(preferences.diet, i.animal) &&
      !i.allergens.some((a) => preferences.allergens.includes(a)) &&
      !preferences.excludedIngredientIds.includes(i.id),
  );

  let result;
  try {
    result = await new AnthropicRecipeGenerator().generate({
      preferences,
      allowedIngredients,
      existingRecipeNames: catalog.recipes.map((r) => r.name),
      count,
    });
  } catch (e) {
    console.error(e);
    throw new HttpError(502, e instanceof Error ? e.message : "Échec de la génération.");
  }

  const created = [];
  for (const r of result.recipes) {
    const cost = computeRecipeCost(r, preferences, ctx);
    if (!cost) continue;
    const row = {
      name: r.name,
      description: r.description,
      cuisine: r.cuisine,
      baseServings: r.baseServings,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      difficulty: r.difficulty,
      equipmentJson: JSON.stringify(r.equipment),
      tagsJson: JSON.stringify(r.tags),
      stepsJson: JSON.stringify(r.steps),
      source: "llm",
    };
    await prisma.$transaction([
      prisma.recipe.upsert({ where: { id: r.id }, create: { id: r.id, ...row }, update: row }),
      prisma.recipeIngredient.deleteMany({ where: { recipeId: r.id } }),
      prisma.recipeIngredient.createMany({
        data: r.ingredients.map((l, position) => ({ recipeId: r.id, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, optional: l.optional, position })),
      }),
    ]);
    created.push({ id: r.id, name: r.name, purchaseCents: cost.purchaseCents, usedCents: cost.usedCents });
  }
  invalidateCatalog();
  return { recipes: created, rejected: result.rejected };
});
