"use client";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  CookingPot,
  ChevronRight,
  Clock,
  Egg,
  Fish,
  Gauge,
  Leaf,
  Package,
  RefreshCw,
  Salad,
  Soup,
  Sparkles,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { BudgetGauge, Button, Card, Notice, Sheet, Stepper } from "@/components/ui";
import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { CUISINES, type Cuisine } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import { BudgetInput } from "./PreferencesForm";

const LEVEL = ["", "Facile", "Moyen", "Difficile"];

/** Illustration du plat (pas de photo dans la base) : icône + dégradé selon ses étiquettes. */
function dishVisual(info?: RecipeSummary): { icon: LucideIcon; tint: string } {
  const t = new Set(info?.tags ?? []);
  if (t.has("poisson") || t.has("fruits-de-mer")) return { icon: Fish, tint: "from-sky-400/25 to-sky-400/5 text-sky-300" };
  if (t.has("soupe")) return { icon: Soup, tint: "from-orange-400/25 to-orange-400/5 text-orange-300" };
  if (t.has("vegan")) return { icon: Leaf, tint: "from-accent/30 to-accent/5 text-accent-text" };
  if (t.has("oeufs")) return { icon: Egg, tint: "from-yellow-300/25 to-yellow-300/5 text-yellow-200" };
  if (t.has("vegetarien")) return { icon: Salad, tint: "from-lime-400/25 to-lime-400/5 text-lime-300" };
  if (t.has("pates") || t.has("riz")) return { icon: Wheat, tint: "from-amber-300/25 to-amber-300/5 text-amber-200" };
  return { icon: UtensilsCrossed, tint: "from-rose-400/25 to-rose-400/5 text-rose-300" };
}

export function MenuSummary({
  result,
  budgetCents,
  persons,
  onBudget,
  onPersons,
  onReoptimize,
  busy,
}: {
  result: MenuResult;
  budgetCents: number;
  persons: number;
  onBudget: (c: number) => void;
  onPersons: (n: number) => void;
  onReoptimize: () => void;
  busy: boolean;
}) {
  return (
    <Card className="space-y-4" aria-labelledby="summary-title">
      <h2 id="summary-title" className="sr-only">
        Résumé du menu
      </h2>
      <BudgetGauge total={result.totalCents} budget={result.budgetCents} />
      {result.recipes.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
            <dt className="text-caption text-muted">Par personne et par repas</dt>
            <dd className="font-numeric text-title-3 font-semibold tabular-nums">≈ {formatEuros(result.perPersonPerMealCents)}</dd>
          </div>
          <div className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
            <dt className="text-caption text-muted">Économie grâce au placard</dt>
            <dd className="font-numeric text-title-3 font-semibold tabular-nums text-accent-text">{formatEuros(result.pantrySavingsCents)}</dd>
          </div>
        </dl>
      )}
      {result.diagnostics.length > 0 && (
        <div aria-live="polite" className="space-y-2">
          {result.diagnostics.map((d, i) => (
            <Notice key={i} level={d.level}>
              {d.message}
            </Notice>
          ))}
        </div>
      )}
      <details className="group rounded-field bg-surface-2 ring-1 ring-inset ring-line" open={result.status === "over-budget"}>
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-field px-3 text-body-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Gauge aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />
            Ajuster en direct
          </span>
          <ChevronDown aria-hidden className="size-4 text-muted transition-transform duration-200 group-open:rotate-180" strokeWidth={ICON_STROKE} />
        </summary>
        <div className="grid gap-4 px-3 pb-3 sm:grid-cols-2">
          <div>
            <label htmlFor="live-budget" className="mb-2 block text-caption font-medium text-muted">
              Budget
            </label>
            <BudgetInput id="live-budget" value={budgetCents} onChange={onBudget} />
          </div>
          <Stepper label="Personnes" value={persons} min={1} max={12} onChange={onPersons} />
          {result.status === "over-budget" && result.recipes.length > 0 && (
            <Button className="sm:col-span-2" fullWidth icon={Sparkles} onClick={onReoptimize} disabled={busy}>
              Réajuster le menu pour tenir le budget
            </Button>
          )}
        </div>
      </details>
    </Card>
  );
}

export function MenuRecipes({
  result,
  recipes,
  ingredients,
  onSwap,
  onRegenerate,
  onCooked,
  cooked,
  busy = false,
}: {
  result: MenuResult;
  recipes: ReadonlyMap<string, RecipeSummary>;
  ingredients: ReadonlyMap<string, IngredientOption>;
  onSwap: (slot: number) => void;
  onRegenerate?: (slot: number) => void;
  onCooked?: (slot: number) => void;
  cooked?: ReadonlySet<number>;
  busy?: boolean;
}) {
  return (
    <ol className="space-y-3" aria-label="Plats du menu">
      {result.recipes.map((r, slot) => {
        const info = recipes.get(r.recipeId);
        const { icon: Icon, tint } = dishVisual(info);
        const href = `/recettes/${r.recipeId}?p=${result.persons}`;
        const done = cooked?.has(slot) ?? false;
        return (
          <Card as="li" key={`${r.recipeId}-${slot}`} padded={false} className={cn("overflow-hidden transition-opacity duration-200", done && "opacity-70")}>
            <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
              <div aria-hidden className={cn("grid size-20 shrink-0 place-items-center rounded-field bg-gradient-to-br ring-1 ring-inset ring-line sm:size-24", tint)}>
                <Icon className="size-9" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-caption font-medium uppercase tracking-wider text-subtle">
                    Repas {slot + 1}
                    {done && (
                      <span className="inline-flex items-center gap-1 normal-case tracking-normal text-accent-text">
                        <CheckCircle2 aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} /> cuisiné
                      </span>
                    )}
                  </p>
                  <p className="font-numeric text-title-3 font-semibold tabular-nums">{formatEuros(r.allocatedCents)}</p>
                </div>
                <h3 className="text-body font-semibold leading-snug [text-wrap:balance]">
                  <Link href={href} className="focus-ring rounded hover:text-accent-text">
                    {r.name}
                  </Link>
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge icon={Clock}>{r.totalMinutes} min</Badge>
                  <Badge>{LEVEL[r.difficulty]}</Badge>
                  <Badge>{CUISINES[r.cuisine as Cuisine] ?? r.cuisine}</Badge>
                  {r.pantryIngredientIds.length > 0 && (
                    <Badge tone="accent" icon={Package}>
                      {r.pantryIngredientIds.length} du placard
                    </Badge>
                  )}
                </div>
                {result.persons > 1 && <p className="mt-1.5 text-caption text-muted tabular-nums">≈ {formatEuros(r.perPersonCents)} / pers.</p>}
              </div>
            </div>
            {r.skippedOptional.length > 0 && (
              <p className="px-4 pb-2 text-caption text-subtle">
                Facultatif non acheté pour tenir le budget : {r.skippedOptional.map((id) => ingredients.get(id)?.name ?? id).join(", ")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1 border-t border-line p-1.5 sm:grid-cols-4">
              {onRegenerate && (
                <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => onRegenerate(slot)} disabled={busy} aria-label={`Régénérer ${r.name}`}>
                  Régénérer
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={ArrowLeftRight} onClick={() => onSwap(slot)} aria-label={`Choisir un autre plat que ${r.name}`}>
                Choisir
              </Button>
              {onCooked && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={done ? CheckCircle2 : CookingPot}
                  aria-pressed={done}
                  onClick={() => onCooked(slot)}
                  disabled={busy}
                  aria-label={done ? `${r.name} : marqué comme cuisiné (annuler)` : `J'ai cuisiné ${r.name} : retirer ses ingrédients du placard`}
                >
                  {done ? "Cuisiné" : "Cuisiné ?"}
                </Button>
              )}
              <Link
                href={href}
                aria-label={`Voir la recette : ${r.name}`}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-1 rounded-field px-3 text-body-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
              >
                Recette <ChevronRight aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
              </Link>
            </div>
          </Card>
        );
      })}
    </ol>
  );
}

export function SwapSheet({
  open,
  onClose,
  current,
  options,
  loading,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current?: string;
  options: SwapOption[] | null;
  loading: boolean;
  onPick: (recipeId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={current ? `Remplacer « ${current} »` : "Remplacer"}>
      {loading && (
        <div role="status" aria-label="Recherche des alternatives" className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-field bg-surface-2" />
          ))}
        </div>
      )}
      {options && options.length === 0 && <p className="text-body-sm text-muted">Aucune alternative compatible avec vos critères.</p>}
      {options && options.length > 0 && (
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.recipeId}>
              <button
                type="button"
                onClick={() => onPick(o.recipeId)}
                className="focus-ring flex min-h-16 w-full items-center justify-between gap-3 rounded-field bg-surface-2 p-3 text-left ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-3"
              >
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="text-caption text-muted">
                    {CUISINES[o.cuisine as Cuisine] ?? o.cuisine} · {o.totalMinutes} min
                  </span>
                </span>
                <span className="text-right">
                  <span className={cn("block font-numeric font-semibold tabular-nums", o.deltaCents > 0 ? "text-danger-text" : "text-accent-text")}>
                    {o.deltaCents > 0 ? "+" : o.deltaCents < 0 ? "−" : "±"}
                    {formatEuros(Math.abs(o.deltaCents))}
                  </span>
                  <span className="text-caption text-muted tabular-nums">
                    total {formatEuros(o.newTotalCents)}
                    {!o.fitsBudget && " · hors budget"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
