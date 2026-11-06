"use client";
import {
  CalendarDays,
  ChefHat,
  Clock,
  CookingPot,
  Flame,
  Pencil,
  Refrigerator,
  Snowflake,
  Sparkles,
  Timer,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Chip, EmptyState, Segmented, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { RecipeSummary } from "@/lib/client/catalog-types";
import { usePersistentState } from "@/lib/client/storage";
import { CUISINES, PreferencesSchema, type Cuisine, type Preferences } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult } from "@/lib/engine/optimize";
import { formatQuantity } from "@/lib/engine/units";
import { DEFAULT_PREFERENCES } from "@/components/planner/Planner";

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const SESSION_DAYS = [
  { value: "0", label: "Dimanche" },
  { value: "6", label: "Samedi" },
  { value: "3", label: "Mercredi" },
] as const;
/** Temps pour réchauffer une portion de restes. */
const REHEAT_MINUTES = 5;
/** Temps gagné le soir quand la base (riz, pâtes…) est déjà cuite. */
const BASE_SAVING = 15;
const newSeed = () => Math.floor(Math.random() * 2_147_483_647);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

/** Un plat convient au batch cooking s'il se réchauffe bien et se garde au moins 2 jours. */
export const isBatchFriendly = (r: RecipeSummary) => r.reheats === true && (r.fridgeDays ?? 0) >= 2;

interface Evening {
  slot: number;
  recipe: MenuResult["recipes"][number];
  kind: "session" | "leftover" | "base" | "tonight";
  /** Soir où le plat a été cuisiné (pour les restes). */
  from?: number;
}

export function BatchPlanner({ recipes }: { recipes: RecipeSummary[] }) {
  const [storedPrefs, setPrefs] = usePersistentState<Preferences>("mb:prefs", DEFAULT_PREFERENCES);
  const prefs = useMemo(() => {
    const p = PreferencesSchema.safeParse(storedPrefs);
    return p.success ? p.data : DEFAULT_PREFERENCES;
  }, [storedPrefs]);
  const [result, setResult] = usePersistentState<MenuResult | null>("mb:result", null);
  const [recent, setRecent] = usePersistentState<string[]>("mb:recent", []);
  const [sessionDay, setSessionDay] = usePersistentState<string>("mb:batch-day", "0");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"tous" | "vegetarien" | "rapide">("tous");
  const toast = useToast();
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const generate = async () => {
    setBusy(true);
    try {
      const next = { ...prefs, batchCooking: true, seed: newSeed(), recentRecipeIds: recent };
      setPrefs({ ...next, recentRecipeIds: [] });
      const r = await api.generate(next);
      setResult(r);
      const ids = r.recipes.map((x) => x.recipeId);
      setRecent((prev) => [...ids, ...prev.filter((id) => !ids.includes(id))].slice(0, Math.min(63, 3 * Math.max(1, ids.length))));
      toast({ title: "Menu batch cooking prêt", description: "Il est aussi affiché dans l'onglet Menu.", tone: "success" });
    } catch (e) {
      toast({ title: "Impossible de générer le menu", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const plan = result?.prepPlan ?? null;
  const hasBatch = !!result && result.recipes.length > 0 && !!plan;

  // Soir par soir : cuisiné pendant la session, restes, ou à cuisiner le soir même.
  const evenings: Evening[] = useMemo(() => {
    if (!result || !plan) return [];
    const sharedSlots = new Set(plan.sharedBases.flatMap((b) => b.slots));
    return result.recipes.map((recipe, slot) => {
      const group = plan.cookOnce.find((g) => g.slots.includes(slot));
      if (group && group.slots[0] !== slot) return { slot, recipe, kind: "leftover", from: group.slots[0] };
      if (group) return { slot, recipe, kind: "session" };
      if (sharedSlots.has(slot)) return { slot, recipe, kind: "base" };
      return { slot, recipe, kind: "tonight" };
    });
  }, [result, plan]);

  const sessionDishes = evenings.filter((e) => e.kind === "session" && plan?.cookOnce.some((g) => g.slots[0] === e.slot));
  const sessionMinutes = useMemo(() => {
    // Préparations actives en série ; les cuissons se chevauchent (on compte la plus longue).
    const active = sessionDishes.reduce((a, e) => a + (byId.get(e.recipe.recipeId)?.prepMinutes ?? 15), 0);
    const longestCook = Math.max(0, ...sessionDishes.map((e) => byId.get(e.recipe.recipeId)?.cookMinutes ?? 20), plan?.sharedBases.length ? 15 : 0);
    return active + longestCook + (plan?.sharedBases.length ?? 0) * 5;
  }, [sessionDishes, byId, plan]);
  /** Temps en cuisine le soir : réchauffer, finir un plat dont la base est prête, ou tout cuisiner. */
  const eveningMinutes = (e: Evening) =>
    e.kind === "leftover" || e.kind === "session" ? REHEAT_MINUTES : e.kind === "base" ? Math.max(10, e.recipe.totalMinutes - BASE_SAVING) : e.recipe.totalMinutes;
  const weekMinutes = evenings.reduce((a, e) => a + eveningMinutes(e), 0);
  const classicMinutes = evenings.reduce((a, e) => a + e.recipe.totalMinutes, 0);

  const dayName = (slot: number) => capitalize(DAYS[(Number(sessionDay) + 1 + slot) % 7]!);
  const friendly = recipes
    .filter(isBatchFriendly)
    .filter((r) => (filter === "vegetarien" ? r.tags.includes("vegetarien") : filter === "rapide" ? r.prepMinutes <= 15 : true))
    .sort((a, b) => (b.fridgeDays ?? 0) - (a.fridgeDays ?? 0) || a.name.localeCompare(b.name, "fr"));

  return (
    <div className="space-y-4">
      {/* Réglages express */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-caption text-muted">Avec vos réglages du menu</p>
            <p className="text-body font-semibold tabular-nums">
              {formatEuros(prefs.budgetCents)} · {prefs.meals} soirs · {prefs.persons} pers.
            </p>
          </div>
          <Link href="/" className="link inline-flex min-h-11 items-center gap-1 text-body-sm">
            <Pencil aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Modifier
          </Link>
        </div>
        <div>
          <p className="mb-2 text-caption font-medium text-muted">Jour de la session de préparation</p>
          <Segmented label="Jour de la session de préparation" value={sessionDay} onChange={setSessionDay} options={SESSION_DAYS} />
        </div>
        <Button icon={Sparkles} fullWidth size="lg" loading={busy} onClick={generate}>
          {hasBatch ? "Nouveau menu batch cooking" : "Générer mon menu batch cooking"}
        </Button>
      </Card>

      {!hasBatch ? (
        <Card>
          <EmptyState
            icon={CookingPot}
            title={result?.recipes.length ? "Votre menu actuel n'est pas en batch cooking" : "Pas encore de menu batch cooking"}
            description="Générez un menu : on choisit des plats qui se gardent et se réchauffent, on mutualise les bases (riz, pâtes…) et on vous donne le plan de la session."
          />
        </Card>
      ) : (
        <>
          {/* Résumé du gain de temps */}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-card bg-surface p-3 shadow-soft ring-1 ring-inset ring-line">
              <dt className="text-caption text-muted">Session</dt>
              <dd className="text-title-3 font-semibold tabular-nums">≈ {duration(sessionMinutes)}</dd>
            </div>
            <div className="rounded-card bg-surface p-3 shadow-soft ring-1 ring-inset ring-line">
              <dt className="text-caption text-muted">Les soirs</dt>
              <dd className="text-title-3 font-semibold tabular-nums">{duration(weekMinutes)}</dd>
            </div>
            <div className="rounded-card bg-accent-soft p-3 ring-1 ring-inset ring-accent/25">
              <dt className="text-caption text-muted">Temps gagné</dt>
              <dd className="text-title-3 font-semibold tabular-nums text-accent-text">{duration(Math.max(0, classicMinutes - weekMinutes - sessionMinutes))}</dd>
            </div>
          </dl>

          {/* La session de préparation */}
          <Card aria-labelledby="session-title">
            <CardHeader
              icon={ChefHat}
              title={<span id="session-title">Session du {DAYS[Number(sessionDay)]}</span>}
              description="Dans cet ordre : les cuissons longues tournent pendant que vous préparez la suite."
            />
            <ol className="space-y-2">
              {plan!.sharedBases.map((b, k) => (
                <Step key={b.ingredientId} n={k + 1} icon={Wheat} title={`Cuire ${formatQuantity(b.quantity, b.unit)} de ${b.name.toLowerCase()}`}>
                  Pour les soirs {b.slots.map((s) => s + 1).join(", ")}. Laissez refroidir puis répartissez en boîtes.
                </Step>
              ))}
              {sessionDishes.map((e, k) => {
                const info = byId.get(e.recipe.recipeId);
                const group = plan!.cookOnce.find((g) => g.slots[0] === e.slot)!;
                return (
                  <Step key={e.slot} n={plan!.sharedBases.length + k + 1} icon={CookingPot} title={`${e.recipe.name} pour ${group.slots.length} soirs`} href={`/recettes/${e.recipe.recipeId}?p=${result!.persons * group.slots.length}`}>
                    {info ? `${info.prepMinutes} min de préparation, ${info.cookMinutes} min de cuisson. ` : ""}Préparez {group.slots.length * result!.persons} portions, puis gardez-les en boîtes séparées.
                  </Step>
                );
              })}
              <Step n={plan!.sharedBases.length + sessionDishes.length + 1} icon={Refrigerator} title="Ranger">
                Étiquetez chaque boîte avec le soir prévu. Au frigo pour les premiers soirs ; au congélateur ce qui va au-delà de la durée de conservation.
              </Step>
            </ol>
            <p className="mt-3 text-caption text-subtle">Estimation : préparations à la suite, cuissons en parallèle.</p>
          </Card>

          {/* Soir par soir */}
          <Card aria-labelledby="week-title">
            <CardHeader icon={CalendarDays} title={<span id="week-title">Soir par soir</span>} />
            <ol className="space-y-2">
              {evenings.map((e) => (
                <li key={e.slot} className="flex items-center gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
                  <span className="w-20 shrink-0">
                    <span className="block text-caption text-subtle">Soir {e.slot + 1}</span>
                    <span className="block text-body-sm font-semibold">{dayName(e.slot)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/recettes/${e.recipe.recipeId}?p=${result!.persons}`} className="focus-ring block truncate rounded font-medium hover:text-accent-text">
                      {e.recipe.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {e.kind === "leftover" && (
                        <Badge tone="accent" icon={Flame}>
                          Réchauffer · {REHEAT_MINUTES} min
                        </Badge>
                      )}
                      {e.kind === "session" && (
                        <Badge tone="accent" icon={CookingPot}>
                          Prêt · réchauffer {REHEAT_MINUTES} min
                        </Badge>
                      )}
                      {e.kind === "base" && (
                        <Badge icon={Wheat}>
                          Base prête · {eveningMinutes(e)} min
                        </Badge>
                      )}
                      {e.kind === "tonight" && <Badge icon={Timer}>À cuisiner · {e.recipe.totalMinutes} min</Badge>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Conservation */}
          {plan!.cookOnce.length > 0 && (
            <Card aria-labelledby="storage-title">
              <CardHeader icon={Refrigerator} title={<span id="storage-title">Conservation</span>} />
              <ul className="space-y-2">
                {plan!.cookOnce.map((g) => {
                  const info = byId.get(g.recipeId);
                  return (
                    <li key={g.recipeId} className="rounded-field bg-surface-2 p-3 text-body-sm ring-1 ring-inset ring-line">
                      <p className="font-medium">{g.name}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {g.fridgeDays !== null && <Badge icon={Refrigerator}>{g.fridgeDays} jours au frigo</Badge>}
                        {info?.freezable && <Badge icon={Snowflake}>Se congèle</Badge>}
                        <Badge icon={CalendarDays}>
                          {g.slots.map((s) => dayName(s).slice(0, 3)).join(", ")}
                        </Badge>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Idées de plats */}
      <Card aria-labelledby="ideas-title">
        <CardHeader icon={UtensilsCrossed} title={<span id="ideas-title">Plats idéaux pour le batch cooking</span>} description={`${friendly.length} recettes qui se gardent au moins 2 jours et se réchauffent bien.`} />
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["tous", "Tous"],
              ["vegetarien", "Végétarien"],
              ["rapide", "≤ 15 min de préparation"],
            ] as const
          ).map(([v, l]) => (
            <Chip key={v} state={filter === v ? "selected" : "neutral"} onClick={() => setFilter(v)}>
              {l}
            </Chip>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {friendly.slice(0, 30).map((r) => (
            <li key={r.id}>
              <Link href={`/recettes/${r.id}`} className="focus-ring flex min-h-14 items-center justify-between gap-3 rounded-field px-1 py-2 hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="text-caption text-muted">
                    {CUISINES[r.cuisine as Cuisine] ?? r.cuisine} · {r.totalMinutes} min
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <Badge icon={Refrigerator}>{r.fridgeDays} j</Badge>
                  {r.freezable && (
                    <Badge icon={Snowflake}>
                      <span className="sr-only">Se congèle</span>
                    </Badge>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {friendly.length > 30 && <p className="mt-2 text-caption text-subtle">Et {friendly.length - 30} autres : le moteur les connaît toutes.</p>}
      </Card>
    </div>
  );
}

function Step({ n, icon: Icon, title, href, children }: { n: number; icon: typeof Clock; title: string; href?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-semibold tabular-nums text-accent-text">
        {n}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={ICON_STROKE} />
          {href ? (
            <Link href={href} className={cn("focus-ring rounded hover:text-accent-text")}>
              {title}
            </Link>
          ) : (
            title
          )}
        </span>
        <span className="mt-0.5 block text-body-sm text-muted">{children}</span>
      </span>
    </li>
  );
}
