import { Suspense } from "react";
import { Planner } from "@/components/planner/Planner";
import { listStores } from "@/lib/server/catalog";
import { getCurrentUserId } from "@/lib/server/user";
import { getCatalogView } from "@/lib/server/views";

export default async function HomePage() {
  const userId = await getCurrentUserId();
  const [{ ingredients, recipes }, stores] = await Promise.all([getCatalogView(), listStores(userId)]);
  return (
    <Suspense>
      <Planner ingredients={ingredients} recipes={recipes} stores={stores} />
    </Suspense>
  );
}
