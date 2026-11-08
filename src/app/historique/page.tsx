import { History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { HistoryList } from "@/components/history/HistoryList";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique et favoris — Popote" };

export default async function HistoryPage() {
  const { recipes } = await getCatalogView();
  return (
    <div>
      <PageHeader icon={History} title="Historique" description="Vos menus enregistrés et vos recettes favorites." />
      <HistoryList recipes={recipes} />
    </div>
  );
}
