"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { Preferences } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";

type Generated = Awaited<ReturnType<typeof api.generateRecipes>>;

/** Génération créative de recettes (IA). Les prix affichés sont calculés par le moteur. */
export function AiRecipes({ prefs }: { prefs: Preferences }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="space-y-3" aria-labelledby="ai-title">
      <h2 id="ai-title" className="font-semibold">
        Nouvelles idées de recettes (IA)
      </h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Crée des recettes adaptées à vos critères, uniquement avec des ingrédients de la base. Leur prix est recalculé par l&apos;application ; elles seront ensuite proposées dans vos menus.
      </p>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            setRes(await api.generateRecipes(prefs));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Erreur");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Création en cours (jusqu'à une minute)…" : "✨ Proposer 2 recettes"}
      </Button>
      <div aria-live="polite" className="space-y-2">
        {error && <Notice level="error">{error}</Notice>}
        {res && (
          <ul className="space-y-1 text-sm">
            {res.recipes.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <Link href={`/recettes/${r.id}?p=${prefs.persons}`} className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
                  {r.name}
                </Link>
                <span className="tabular-nums">{formatEuros(r.purchaseCents)} en caisse</span>
              </li>
            ))}
            {res.rejected.map((r) => (
              <li key={r.name} className="text-stone-500">
                Écartée : {r.name} ({r.reason})
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
