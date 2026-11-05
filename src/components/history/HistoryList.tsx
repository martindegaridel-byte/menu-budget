"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api, type SavedMenuSummary } from "@/lib/client/api";
import type { RecipeSummary } from "@/lib/client/catalog-types";
import { formatEuros } from "@/lib/engine/money";

export function HistoryList({ recipes }: { recipes: RecipeSummary[] }) {
  const [menus, setMenus] = useState<SavedMenuSummary[] | null>(null);
  const [favRecipes, setFavRecipes] = useState<string[]>([]);
  const [onlyFav, setOnlyFav] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  const reload = () =>
    Promise.all([api.listMenus(), api.favorites()])
      .then(([m, f]) => {
        setMenus(m.menus);
        setFavRecipes(f.recipeIds);
      })
      .catch(() => setError("Impossible de charger l'historique."));
  useEffect(() => {
    void reload();
  }, []);

  if (error) return <Notice level="error">{error}</Notice>;
  if (!menus) return <p role="status">Chargement…</p>;
  const shown = onlyFav ? menus.filter((m) => m.favorite) : menus;

  return (
    <div className="space-y-4">
      {favRecipes.length > 0 && (
        <Card aria-labelledby="fav-recipes">
          <h2 id="fav-recipes" className="mb-2 text-lg font-semibold">
            Recettes favorites
          </h2>
          <ul className="flex flex-wrap gap-2">
            {favRecipes.map((id) => (
              <li key={id}>
                <Link
                  href={`/recettes/${id}`}
                  className="inline-flex min-h-9 items-center rounded-full bg-emerald-50 px-3 text-sm text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900"
                >
                  ★ {recipeMap.get(id)?.name ?? id}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Menus enregistrés</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-emerald-700" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
          Favoris uniquement
        </label>
      </div>

      {shown.length === 0 && <p className="text-stone-600 dark:text-stone-400">Aucun menu pour l&apos;instant. Enregistrez-en un depuis l&apos;écran Menu.</p>}
      <ul className="space-y-3">
        {shown.map((m) => (
          <Card as="li" key={m.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {new Date(m.createdAt).toLocaleDateString("fr-FR")} · {m.persons} pers. · {formatEuros(m.totalCents)} / {formatEuros(m.budgetCents)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={m.favorite}
                aria-label={m.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                onClick={async () => {
                  await api.updateMenu(m.id, { favorite: !m.favorite });
                  await reload();
                }}
              >
                {m.favorite ? "★" : "☆"}
              </Button>
            </div>
            <p className="text-sm">{m.recipeNames.join(" · ")}</p>
            <div className="flex gap-2">
              <Link href={`/?menu=${m.id}`} className="inline-flex min-h-9 items-center rounded-xl bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800">
                Rouvrir (prix actuels)
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await api.deleteMenu(m.id);
                  await reload();
                }}
              >
                Supprimer
              </Button>
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
}
