import { PantryEditor } from "@/components/pantry/PantryEditor";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon placard — Menu Budget" };

export default async function PantryPage() {
  const { ingredients } = await getCatalogView();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mon placard</h1>
      <PantryEditor ingredients={ingredients} />
    </div>
  );
}
