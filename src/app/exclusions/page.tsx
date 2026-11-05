import { Ban } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
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
    <div>
      <PageHeader icon={Ban} title="Mes exclusions" description="Ce que vous ne mangez jamais, et vos allergies : appliqués automatiquement à tous vos menus." />
      <ExclusionsEditor initial={profile} ingredients={ingredients} groups={groups} />
    </div>
  );
}
