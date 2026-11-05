"use client";
import { useId, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api, type OpenPricesImport } from "@/lib/client/api";
import { usePersistentState } from "@/lib/client/storage";
import { formatEuros } from "@/lib/engine/money";

/** Import des prix réels relevés par la communauté Open Prices (Open Food Facts). */
export function OpenPricesImporter({ storeId, storeName, onImported }: { storeId: string; storeName: string; onImported: () => void }) {
  const [saved, setSaved] = usePersistentState<Record<string, string>>("mb:openprices", {});
  const [location, setLocation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OpenPricesImport | null>(null);
  const [showAll, setShowAll] = useState(false);
  const inputId = useId();
  const value = location ?? saved[storeId] ?? "";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.importOpenPrices(storeId, value);
      setReport(r);
      setSaved({ ...saved, [storeId]: value });
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3" aria-labelledby="op-title">
      <h2 id="op-title" className="text-lg font-semibold">
        Prix réels relevés (Open Prices)
      </h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Open Prices rassemble des prix photographiés en magasin par la communauté Open Food Facts. Cherchez votre magasin sur{" "}
        <a href="https://prices.openfoodfacts.org" target="_blank" rel="noreferrer" className="font-medium text-emerald-800 underline dark:text-emerald-300">
          prices.openfoodfacts.org
        </a>
        , copiez l&apos;adresse de sa page et collez-la ici. Les prix trouvés remplacent les estimations pour « {storeName} », sauf s&apos;ils sont nettement plus chers que d&apos;habitude.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Adresse du magasin sur Open Prices
        </label>
        <input
          id={inputId}
          className="input flex-1"
          placeholder="https://prices.openfoodfacts.org/locations/10"
          value={value}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Button onClick={run} disabled={busy || !value.trim()}>
          {busy ? "Import en cours (≈ 30 s)…" : report ? "Mettre à jour" : "Importer les prix"}
        </Button>
      </div>
      <div aria-live="polite" className="space-y-3">
        {error && <Notice level="error">{error}</Notice>}
        {report && (
          <>
            <Notice level="info">
              {report.matchedIngredients} ingrédients sur {report.totalIngredients} ont maintenant un prix réel ({report.imported} formats), d&apos;après{" "}
              {report.fetched} relevés depuis le {new Date(report.since).toLocaleDateString("fr-FR")} à {report.location.name}. Les autres ingrédients gardent
              les estimations.
            </Notice>
            {report.ignoredExpensive > 0 && (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {report.ignoredExpensive} prix trop chers par rapport au prix habituel (marques chères, bio…) ont été ignorés : pour ces produits, le prix
                habituel est conservé.
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Masquer le détail" : "Voir tous les prix importés"}
            </Button>
            {showAll && (
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {report.items.map((i) => (
                  <li key={i.ingredientId} className="flex justify-between gap-3 border-b border-stone-100 py-1 dark:border-stone-800">
                    <span>
                      <span className="font-medium">{i.ingredientName}</span>
                      <span className="block text-xs text-stone-600 dark:text-stone-400">
                        {i.packages[0]?.label} · relevé le {new Date(i.packages[0]?.asOf ?? "").toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums">{formatEuros(i.packages[0]?.priceCents ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-stone-500">
        Données{" "}
        <a href="https://prices.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">
          Open Prices
        </a>{" "}
        (Open Food Facts), licence{" "}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer" className="underline">
          ODbL
        </a>
        .
      </p>
    </Card>
  );
}
