import { History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { HistoryList } from "@/components/history/HistoryList";
import { PriceTrends } from "@/components/history/PriceTrends";
import { loadSeedData } from "@/lib/data/seed";
import type { TrendPoint } from "@/lib/client/priceTrends";
import { getCatalogView } from "@/lib/server/views";
import { z } from "zod";
import trendsJson from "../../../data/price-trends.json";

const TrendsFileSchema = z.object({ stores: z.record(z.string(), z.record(z.string(), z.array(z.tuple([z.string(), z.number(), z.number()])))) });

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique et favoris — Popote" };

export default async function HistoryPage() {
  const { recipes } = await getCatalogView();
  const seed = loadSeedData();
  const names = Object.fromEntries(seed.ingredients.map((i) => [i.id, { name: i.name, unit: i.unit }]));
  const trends: Record<string, Record<string, TrendPoint[]>> = TrendsFileSchema.parse(trendsJson).stores;
  return (
    <div>
      <PageHeader icon={History} title="Historique" description="Vos menus enregistrés et vos recettes favorites." />
      <HistoryList recipes={recipes} />
      <div className="mt-4">
        <PriceTrends trends={trends} names={names} stores={seed.stores.map((s) => ({ id: s.id, name: s.name }))} />
      </div>
    </div>
  );
}
