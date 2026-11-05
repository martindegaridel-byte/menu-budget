import { ExclusionsEditor } from "@/components/exclusions/ExclusionsEditor";
import { EXCLUSION_GROUPS } from "@/lib/domain/profile";
import { getCatalog } from "@/lib/server/catalog";
import { getProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes exclusions — Menu Budget" };

export default async function ExclusionsPage() {
  const userId = await getCurrentUserId();
  const [{ ingredients }, catalog, profile] = await Promise.all([getCatalogView(), getCatalog(), getProfile(userId)]);
  const groups = EXCLUSION_GROUPS.map((g) => ({ id: g.id, label: g.label, ingredientIds: catalog.ingredients.filter(g.match).map((i) => i.id) }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mes exclusions</h1>
      <p className="text-stone-600 dark:text-stone-400">Ce que vous ne mangez jamais : appliqué automatiquement à tous vos menus.</p>
      <ExclusionsEditor initial={profile} ingredients={ingredients} groups={groups} />
    </div>
  );
}
