import { AlertTriangle, ChevronLeft, CookingPot, Flame, Leaf, Timer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Badge } from "@/components/ds";
import { MacroBar } from "@/components/MacroBar";
import { RecipeStorage } from "@/components/RecipeStorage";
import { RecipeActions } from "@/components/recipe/RecipeActions";
import { RecipeSteps, type RenderedDetail } from "@/components/recipe/RecipeSteps";
import { RecipePhotoPanel } from "@/components/recipe/RecipePhotoPanel";
import { recipeDetail, renderDetailText } from "@/lib/data/details";
import { nutritionPerPortion } from "@/lib/engine/nutrition";
import { ALLERGENS, CUISINES, EQUIPMENT } from "@/lib/domain/schemas";
import { compatibleDiets } from "@/lib/engine/diet";
import { toBaseQuantity, formatQuantity } from "@/lib/engine/units";
import { recipePhoto } from "@/lib/photos";
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
  const [fav, rating] = await Promise.all([
    prisma.favoriteRecipe.findUnique({ where: { userId_recipeId: { userId, recipeId: id } } }),
    prisma.recipeRating.findUnique({ where: { userId_recipeId: { userId, recipeId: id } } }),
  ]);
  const favorite = !!fav;
  const photo = recipePhoto(recipe.id);

  const lines = recipe.ingredients.map((l) => {
    const ing = catalog.ingredientsById.get(l.ingredientId)!;
    return { ...l, ing, qty: toBaseQuantity(l.quantity, l.unit, ing) * factor };
  });
  const allergens = [...new Set(lines.filter((l) => !l.optional).flatMap((l) => l.ing.allergens))];
  const nutrition = nutritionPerPortion(new Map(lines.filter((l) => !l.optional).map((l) => [l.ingredientId, l.qty])), catalog.ingredientsById, persons);
  // Version détaillée : quantités insérées dans le texte pour le nombre de personnes choisi.
  const rawDetail = recipeDetail(recipe.id);
  const quantities = new Map(lines.map((l) => [l.ingredientId, { quantity: l.qty, unit: l.ing.unit, gramsPerPiece: l.ing.gramsPerPiece }]));
  const render = (t: string) => renderDetailText(t, quantities, factor);
  const detail: RenderedDetail | null = rawDetail
    ? {
        utensils: rawDetail.utensils,
        prep: rawDetail.prep.map(render),
        steps: rawDetail.steps.map((st) => ({ text: render(st.text), ...(st.tip ? { tip: render(st.tip) } : {}) })),
        ...(rawDetail.serve ? { serve: render(rawDetail.serve) } : {}),
      }
    : null;
  const diets = compatibleDiets(lines.filter((l) => !l.optional).map((l) => l.ing.animal));

  return (
    <article className="space-y-4">
      <Link href="/" className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-field px-2 text-body-sm font-medium text-muted hover:text-fg">
        <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
        Retour au menu
      </Link>
      <RecipePhotoPanel recipeId={recipe.id} recipeName={recipe.name} stock={photo} />
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption font-medium uppercase tracking-wider text-subtle">{CUISINES[recipe.cuisine]}</p>
            <h1 className="text-title-1 font-semibold tracking-tight [text-wrap:balance]">{recipe.name}</h1>
          </div>
          <FavoriteButton recipeId={recipe.id} initial={favorite} />
        </div>
        {recipe.description && <p className="text-body-sm text-muted">{recipe.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Badge icon={Timer}>Préparation {recipe.prepMinutes} min</Badge>
          <Badge icon={Flame}>Cuisson {recipe.cookMinutes} min</Badge>
          <Badge icon={CookingPot}>{recipe.equipment.map((e) => EQUIPMENT[e]).join(", ")}</Badge>
          <Badge tone="accent" icon={Leaf}>
            {diets.includes("vegan") ? "Vegan" : diets.includes("vegetarien") ? "Végétarien" : diets.includes("pescetarien") ? "Pescétarien" : "Omnivore"}
          </Badge>
        </div>
        {allergens.length > 0 && (
          <p className="flex items-start gap-2 text-body-sm text-muted">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn-text" strokeWidth={1.75} />
            <span>Allergènes : {allergens.map((a) => ALLERGENS[a]).join(", ")}</span>
          </p>
        )}
        <RecipeStorage recipe={recipe} />
        {nutrition && (
          <div className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
            <p className="mb-1.5 text-caption text-muted">Par portion (estimation)</p>
            <MacroBar n={nutrition} />
          </div>
        )}
      </header>

      <RecipeActions
        recipeId={recipe.id}
        recipeName={recipe.name}
        persons={persons}
        ingredients={lines.map((l) => ({ id: l.ingredientId, name: l.ing.name, quantity: formatQuantity(l.qty, l.ing.unit), optional: l.optional }))}
        steps={recipe.steps}
        detail={detail}
        initialStars={rating?.stars ?? null}
        initialNote={rating?.note ?? ""}
      />

      <section aria-labelledby="ing-title" className="rounded-card bg-surface p-4 shadow-soft ring-1 ring-inset ring-line sm:p-5">
        <h2 id="ing-title" className="mb-2 text-title-3 font-semibold">
          Ingrédients pour {persons} personne{persons > 1 ? "s" : ""}
        </h2>
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.ingredientId} className="flex justify-between gap-2 py-2">
              <span>
                {l.ing.name}
                {l.optional && <span className="text-caption text-subtle"> (facultatif)</span>}
              </span>
              <span className="tabular-nums text-muted">{formatQuantity(l.qty, l.ing.unit)}</span>
            </li>
          ))}
        </ul>
      </section>

      <RecipeSteps steps={recipe.steps} detail={detail} />
    </article>
  );
}
