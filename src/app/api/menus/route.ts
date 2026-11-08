import { SaveMenuRequestSchema } from "@/lib/domain/api";
import { evaluateMenu } from "@/lib/engine/optimize";
import { formatEuros } from "@/lib/engine/money";
import { buildEngineContext } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { parseBody, route } from "@/lib/server/http";
import { withProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";

/** Historique des menus (les plus récents d'abord). */
export const GET = route(async () => {
  const userId = await getCurrentUserId();
  const menus = await prisma.savedMenu.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, favorite: true, totalCents: true, budgetCents: true, actualCents: true, createdAt: true, resultJson: true },
  });
  return {
    menus: menus.map(({ resultJson, ...m }) => {
      const r = JSON.parse(resultJson) as { recipes: { name: string }[]; persons: number; lunchPortions?: number; pantrySavingsCents?: number };
      return {
        ...m,
        persons: r.persons,
        portions: r.recipes.length * (r.persons + (r.lunchPortions ?? 0)),
        pantrySavingsCents: r.pantrySavingsCents ?? 0,
        recipeNames: r.recipes.map((x) => x.name),
      };
    }),
  };
});

/** Enregistre un menu : le résultat est recalculé côté serveur (jamais repris du client). */
export const POST = route(async (req: Request) => {
  const { name, preferences: raw, recipeIds, favorite } = await parseBody(req, SaveMenuRequestSchema);
  const userId = await getCurrentUserId();
  const preferences = await withProfile(userId, raw);
  const ctx = await buildEngineContext(userId, preferences);
  const result = evaluateMenu(recipeIds, preferences, ctx);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date());
  const menu = await prisma.savedMenu.create({
    data: {
      userId,
      name: name || `Menu du ${date} · ${result.recipes.length} repas · ${formatEuros(result.totalCents)}`,
      favorite: favorite ?? false,
      preferencesJson: JSON.stringify(preferences),
      resultJson: JSON.stringify(result),
      totalCents: result.totalCents,
      budgetCents: preferences.budgetCents,
    },
  });
  return { id: menu.id };
});
