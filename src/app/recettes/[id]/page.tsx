import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecipeStorage } from "@/components/RecipeStorage";
import { ALLERGENS, CUISINES, EQUIPMENT } from "@/lib/domain/schemas";
import { compatibleDiets } from "@/lib/engine/diet";
import { toBaseQuantity, formatQuantity } from "@/lib/engine/units";
import { getCatalog } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { getCurrentUserId } from "@/lib/server/user";

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ id }, { p }] = await Promise.all([params, searchParams]);
  const catalog = await getCatalog();
  const recipe = catalog.recipes.find((r) => r.id === id);
  if (!recipe) notFound();
  const persons = Math.min(12, Math.max(1, Number(p) || recipe.baseServings));
  const factor = persons / recipe.baseServings;
  const userId = await getCurrentUserId();
  const favorite = !!(await prisma.favoriteRecipe.findUnique({ where: { userId_recipeId: { userId, recipeId: id } } }));

  const lines = recipe.ingredients.map((l) => {
    const ing = catalog.ingredientsById.get(l.ingredientId)!;
    return { ...l, ing, qty: toBaseQuantity(l.quantity, l.unit, ing) * factor };
  });
  const allergens = [...new Set(lines.filter((l) => !l.optional).flatMap((l) => l.ing.allergens))];
  const diets = compatibleDiets(lines.filter((l) => !l.optional).map((l) => l.ing.animal));

  return (
    <article className="space-y-4">
      <Link href="/" className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300">
        ← Retour au menu
      </Link>
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{recipe.name}</h1>
          <FavoriteButton recipeId={recipe.id} initial={favorite} />
        </div>
        <p className="text-stone-600 dark:text-stone-400">{recipe.description}</p>
        <p className="flex flex-wrap gap-x-3 text-sm text-stone-600 dark:text-stone-400">
          <span>{CUISINES[recipe.cuisine]}</span>
          <span>Préparation {recipe.prepMinutes} min</span>
          <span>Cuisson {recipe.cookMinutes} min</span>
          <span>{recipe.equipment.map((e) => EQUIPMENT[e]).join(", ")}</span>
        </p>
        <p className="text-sm">
          {diets.includes("vegan") ? "🌱 Vegan" : diets.includes("vegetarien") ? "🥚 Végétarien" : diets.includes("pescetarien") ? "🐟 Pescétarien" : "🍗 Omnivore"}
          {allergens.length > 0 && <> · Allergènes : {allergens.map((a) => ALLERGENS[a]).join(", ")}</>}
        </p>
        <RecipeStorage recipe={recipe} />
      </header>

      <section aria-labelledby="ing-title" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <h2 id="ing-title" className="mb-2 text-lg font-semibold">
          Ingrédients pour {persons} personne{persons > 1 ? "s" : ""}
        </h2>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {lines.map((l) => (
            <li key={l.ingredientId} className="flex justify-between gap-2 py-2">
              <span>
                {l.ing.name}
                {l.optional && <span className="text-sm text-stone-500"> (facultatif)</span>}
              </span>
              <span className="tabular-nums text-stone-700 dark:text-stone-300">{formatQuantity(l.qty, l.ing.unit)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <h2 id="steps-title" className="mb-2 text-lg font-semibold">
          Préparation
        </h2>
        <ol className="list-decimal space-y-2 pl-5">
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
    </article>
  );
}
