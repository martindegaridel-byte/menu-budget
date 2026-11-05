import { StoresManager } from "@/components/stores/StoresManager";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magasins et prix — Menu Budget" };

export default async function StoresPage() {
  const { ingredients } = await getCatalogView();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Magasins et prix</h1>
      <StoresManager ingredients={ingredients} />
    </div>
  );
}
