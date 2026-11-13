"use client";
import { CalendarDays, Check, History as HistoryIcon, Receipt, RotateCcw, Star, Trash2, Users, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, IconButton, Segmented, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { BudgetInput } from "@/components/planner/PreferencesForm";
import { Notice } from "@/components/ui";
import { SpendingOverview } from "./SpendingOverview";
import { api, type SavedMenuSummary } from "@/lib/client/api";
import type { RecipeSummary } from "@/lib/client/catalog-types";
import { formatEuros } from "@/lib/engine/money";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export function HistoryList({ recipes }: { recipes: RecipeSummary[] }) {
  const [menus, setMenus] = useState<SavedMenuSummary[] | null>(null);
  const [favRecipes, setFavRecipes] = useState<string[]>([]);
  const [view, setView] = useState<"tous" | "favoris">("tous");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
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
  if (!menus)
    return (
      <div role="status" aria-label="Chargement de l'historique" className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-card bg-surface ring-1 ring-inset ring-line" />
        ))}
      </div>
    );

  if (menus.length === 0 && favRecipes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={HistoryIcon}
          headingLevel={2}
          title="Aucun menu enregistré pour l'instant"
          description="Composez un menu puis touchez « Enregistrer » : il apparaîtra ici, prêt à être refait en un tap."
          action={
            <Link
              href="/"
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-field bg-accent-2 px-5 font-semibold text-accent-fg shadow-soft hover:brightness-110"
            >
              <UtensilsCrossed aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
              Composer un menu
            </Link>
          }
        />
      </Card>
    );
  }

  const shown = view === "favoris" ? menus.filter((m) => m.favorite) : menus;
  const toggleFav = async (m: SavedMenuSummary) => {
    setMenus(menus.map((x) => (x.id === m.id ? { ...x, favorite: !m.favorite } : x)));
    try {
      await api.updateMenu(m.id, { favorite: !m.favorite });
    } catch {
      toast({ title: "Impossible de modifier le favori", tone: "error" });
      void reload();
    }
  };
  const saveActual = async (m: SavedMenuSummary, actualCents: number | null) => {
    setMenus(menus.map((x) => (x.id === m.id ? { ...x, actualCents } : x)));
    try {
      await api.updateMenu(m.id, { actualCents });
      toast({ title: actualCents === null ? "Montant effacé" : `Montant payé enregistré : ${formatEuros(actualCents)}`, tone: "success" });
    } catch {
      toast({ title: "Impossible d'enregistrer le montant", tone: "error" });
      void reload();
    }
  };
  const remove = async (m: SavedMenuSummary) => {
    await api.deleteMenu(m.id);
    await reload();
    toast({ title: `« ${m.name} » supprimé`, tone: "info" });
  };

  return (
    <div className="space-y-5">
      {menus.length > 0 && <SpendingOverview menus={menus} />}
      {favRecipes.length > 0 && (
        <section aria-labelledby="fav-recipes">
          <h2 id="fav-recipes" className="mb-2 text-caption font-semibold uppercase tracking-wider text-subtle">
            Recettes favorites
          </h2>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {favRecipes.map((id) => (
              <li key={id} className="shrink-0">
                <Link
                  href={`/recettes/${id}`}
                  className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-body-sm font-medium ring-1 ring-inset ring-line-strong hover:bg-surface-3"
                >
                  <Star aria-hidden className="size-4 fill-warn text-warn" strokeWidth={ICON_STROKE} />
                  {recipeMap.get(id)?.name ?? id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="menus-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="menus-title" className="text-title-3 font-semibold">
            Menus enregistrés
          </h2>
          <Segmented
            label="Afficher"
            value={view}
            onChange={setView}
            options={[
              { value: "tous", label: `Tous (${menus.length})` },
              { value: "favoris", label: "Favoris", icon: Star },
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <Card>
            <EmptyState icon={Star} title="Aucun menu favori" description="Touchez l'étoile d'un menu pour le retrouver ici." className="py-6" />
          </Card>
        ) : (
          <ul className="space-y-3">
            {shown.map((m) => {
              const ratio = m.budgetCents > 0 ? m.totalCents / m.budgetCents : 1;
              return (
                <Card as="li" key={m.id} padded={false} className="overflow-hidden">
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-body font-semibold">{m.name}</h3>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge icon={CalendarDays}>{dateFmt.format(new Date(m.createdAt))}</Badge>
                          <Badge icon={Users}>{m.persons} pers.</Badge>
                          <Badge icon={UtensilsCrossed}>{m.recipeNames.length} repas</Badge>
                        </div>
                      </div>
                      <IconButton
                        icon={Star}
                        label={m.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                        aria-pressed={m.favorite}
                        onClick={() => void toggleFav(m)}
                        className={cn(m.favorite ? "text-warn [&_svg]:fill-warn" : "text-muted")}
                      />
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between text-body-sm">
                        <span className="text-muted">Coût prévu</span>
                        <span className="tabular-nums">
                          <span className="font-numeric font-semibold">{formatEuros(m.totalCents)}</span>
                          <span className="text-muted"> / {formatEuros(m.budgetCents)}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <div
                          className={cn("h-full rounded-full", ratio > 1 ? "bg-danger" : ratio > 0.9 ? "bg-warn" : "bg-accent")}
                          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                        />
                      </div>
                    </div>
                    <p className="line-clamp-2 text-body-sm text-muted">{m.recipeNames.join(" · ")}</p>
                    <ActualCost menu={m} onSave={(c) => void saveActual(m, c)} />
                  </div>
                  <div className="flex items-center gap-1 border-t border-line p-1.5">
                    <Link
                      href={`/?menu=${m.id}`}
                      className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-field text-body-sm font-medium text-accent-text hover:bg-accent-soft"
                    >
                      <RotateCcw aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                      Refaire ce menu
                    </Link>
                    <IconButton icon={Trash2} label={`Supprimer « ${m.name} »`} onClick={() => void remove(m)} className="text-muted hover:bg-danger-soft hover:text-danger-text" />
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
        <p className="text-caption text-subtle">« Refaire ce menu » le recalcule avec les prix actuels de votre magasin.</p>
      </section>
    </div>
  );
}

/** Montant réellement payé (ticket) et écart avec le coût prévu. */
function ActualCost({ menu, onSave }: { menu: SavedMenuSummary; onSave: (cents: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(menu.actualCents ?? menu.totalCents);
  const id = `actual-${menu.id}`;
  if (editing) {
    return (
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value);
          setEditing(false);
        }}
      >
        <div className="flex-1">
          <label htmlFor={id} className="mb-1.5 block text-caption text-muted">
            Montant payé en caisse
          </label>
          <BudgetInput id={id} value={value} onChange={setValue} />
        </div>
        <IconButton icon={Check} label="Enregistrer le montant payé" variant="primary" type="submit" />
      </form>
    );
  }
  if (menu.actualCents === null) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-field text-body-sm font-medium text-accent-text">
        <Receipt aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Saisir le montant payé
      </button>
    );
  }
  const diff = menu.actualCents - menu.totalCents;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2 px-3 py-1.5 ring-1 ring-inset ring-line">
      <span className="text-body-sm">
        Payé <span className="font-semibold tabular-nums">{formatEuros(menu.actualCents)}</span>
        <span className={cn("ml-2 text-caption font-medium tabular-nums", diff > 0 ? "text-danger-text" : "text-accent-text")}>
          {diff === 0 ? "comme prévu" : `${diff > 0 ? "+" : "−"}${formatEuros(Math.abs(diff))} par rapport au prévu`}
        </span>
      </span>
      <button type="button" onClick={() => setEditing(true)} className="focus-ring min-h-11 rounded-field px-2 text-caption font-medium text-muted hover:text-fg">
        Modifier
      </button>
    </div>
  );
}
