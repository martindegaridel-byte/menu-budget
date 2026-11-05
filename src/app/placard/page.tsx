import { Package } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PantryEditor } from "@/components/pantry/PantryEditor";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon placard — Menu Budget" };

export default async function PantryPage() {
  const { ingredients } = await getCatalogView();
  return (
    <div>
      <PageHeader icon={Package} title="Mon placard" description="Ce que vous avez déjà ne coûte rien : vos menus en tiennent compte." />
      <PantryEditor ingredients={ingredients} />
    </div>
  );
}
