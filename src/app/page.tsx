import { Suspense } from "react";
import { Planner } from "@/components/planner/Planner";
import { isRecipeGeneratorEnabled } from "@/lib/llm/anthropic";
import { listStores } from "@/lib/server/catalog";
import { getProfile } from "@/lib/server/profile";
import { getCurrentUserId } from "@/lib/server/user";
import { getCatalogView } from "@/lib/server/views";

export default async function HomePage() {
  const userId = await getCurrentUserId();
  const [{ ingredients, recipes }, stores, profile] = await Promise.all([getCatalogView(), listStores(userId), getProfile(userId)]);
  return (
    <Suspense>
      <Planner ingredients={ingredients} recipes={recipes} stores={stores} llmEnabled={isRecipeGeneratorEnabled()} permanent={profile} />
    </Suspense>
  );
}
