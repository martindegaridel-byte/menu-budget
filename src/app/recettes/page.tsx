import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { RecipeBrowser } from "@/components/recipes/RecipeBrowser";
import { getCurrentUserId } from "@/lib/server/user";
import { getRecipeBrowseData } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recettes — Menu Budget" };

export default async function RecipesPage() {
  const userId = await getCurrentUserId();
  const recipes = await getRecipeBrowseData(userId);
  return (
    <div>
      <PageHeader icon={BookOpen} title="Recettes" description={`${recipes.length} recettes : cherchez, filtrez, ajoutez à votre menu.`} />
      <RecipeBrowser recipes={recipes} />
    </div>
  );
}
