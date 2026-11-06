import { CookingPot } from "lucide-react";
import { BatchPlanner } from "@/components/batch/BatchPlanner";
import { PageHeader } from "@/components/PageHeader";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch cooking — Menu Budget" };

export default async function BatchPage() {
  const { recipes } = await getCatalogView();
  return (
    <div>
      <PageHeader icon={CookingPot} title="Batch cooking" description="Cuisinez une fois, mangez plusieurs soirs : le plan de votre session et de la semaine." />
      <BatchPlanner recipes={recipes} />
    </div>
  );
}
