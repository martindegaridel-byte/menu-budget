import { HistoryList } from "@/components/history/HistoryList";
import { getCatalogView } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique et favoris — Menu Budget" };

export default async function HistoryPage() {
  const { recipes } = await getCatalogView();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Historique et favoris</h1>
      <HistoryList recipes={recipes} />
    </div>
  );
}
