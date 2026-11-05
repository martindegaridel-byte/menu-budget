import { Store } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StoresManager } from "@/components/stores/StoresManager";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magasins et prix — Menu Budget" };

export default async function StoresPage() {
  const { ingredients } = await getCatalogView();
  return (
    <div>
      <PageHeader icon={Store} title="Magasins et prix" description="Vos magasins, la fraîcheur des prix et vos corrections." />
      <StoresManager ingredients={ingredients} />
    </div>
  );
}
