"use client";
import {
  CalendarDays,
  ChefHat,
  Clock,
  CookingPot,
  Flame,
  Pencil,
  Play,
  Refrigerator,
  Snowflake,
  Sparkles,
  Timer,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Chip, EmptyState, Segmented, Stepper, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { RecipeSummary } from "@/lib/client/catalog-types";
import { usePersistentState } from "@/lib/client/storage";
import { CUISINES, PreferencesSchema, type Cuisine, type Preferences } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult } from "@/lib/engine/optimize";
import { formatQuantity } from "@/lib/engine/units";
import { DEFAULT_PREFERENCES } from "@/components/planner/Planner";
import { CookMode } from "@/components/recipe/CookMode";
import { buildSessionSteps } from "@/lib/client/batchSession";

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const SESSION_DAYS = [
  { value: "1", label: "Lun" },
  { value: "2", label: "Mar" },
  { value: "3", label: "Mer" },
  { value: "4", label: "Jeu" },
  { value: "5", label: "Ven" },
  { value: "6", label: "Sam" },
  { value: "0", label: "Dim" },
] as const;
const SESSION_LENGTHS = [
  { value: "120", label: "2 h" },
  { value: "150", label: "2 h 30" },
  { value: "180", label: "3 h" },
] as const;
/** Temps pour réchauffer une portion. */
const REHEAT_MINUTES = 5;
const newSeed = () => Math.floor(Math.random() * 2_147_483_647);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

/** Un plat convient au batch cooking s'il se réchauffe bien et se garde au moins 2 jours. */
export const isBatchFriendly = (r: RecipeSummary) => r.reheats === true && (r.fridgeDays ?? 0) >= 2;

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
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setPrefs({ ...prefs, [k]: v });

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
  const hasBatch = !!result && result.recipes.length > 0 && !!plan && typeof plan.sessionMinutes === "number";
  const dayName = (slot: number) => capitalize(DAYS[(Number(sessionDay) + slot) % 7]!);

  // Plats distincts de la session : les bases d'abord, puis les cuissons les plus longues (lancées en premier).
  const dishes = useMemo(() => {
    if (!result) return [];
    const slotsById = new Map<string, number[]>();
    result.recipes.forEach((r, k) => slotsById.set(r.recipeId, [...(slotsById.get(r.recipeId) ?? []), k]));
    return [...slotsById.entries()]
      .map(([id, slots]) => ({ id, slots, name: result.recipes[slots[0]!]!.name, info: byId.get(id) }))
      .sort((a, b) => (b.info?.cookMinutes ?? 0) - (a.info?.cookMinutes ?? 0));
  }, [result, byId]);

  // Session guidée : toutes les recettes enchaînées dans l'ordre pratique, avec les minuteurs.
  const [session, setSession] = useState<string[] | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const startSession = async () => {
    if (!result || !plan) return;
    setSessionLoading(true);
    try {
      const portions = result.persons + (result.lunchPortions ?? 0);
      const { dishes: steps } = await api.sessionSteps(dishes.map((d) => ({ id: d.id, persons: Math.min(48, portions * d.slots.length) })));
      const byDish = new Map(steps.map((x) => [x.id, x]));
      const sessionDishes = dishes.flatMap((d) => {
        const x = byDish.get(d.id);
        return x ? [{ name: d.name, prep: x.prep, steps: x.steps, cookMinutes: x.cookMinutes, meals: d.slots.length }] : [];
      });
      const bases = plan.sharedBases.map((b) => ({
        text: `Cuire ${formatQuantity(b.quantity, b.unit)} de ${b.name.toLowerCase()} en une fois, puis laisser refroidir.`,
        dishNames: [...new Set(b.slots.map((slot) => result.recipes[slot]!.name))],
      }));
      const storage = `Laisser refroidir, puis une boîte par repas, étiquetée avec le jour. ${
        freeze.size > 0 ? `Au congélateur : ${[...freeze].map(dayName).join(", ").toLowerCase()}.` : "Tout va au frigo."
      } Les plats se réchauffent en 5 minutes.`;
      setSession(buildSessionSteps(sessionDishes, bases, storage));
    } catch (e) {
      toast({ title: "Session indisponible", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSessionLoading(false);
    }
  };

  const freeze = new Set(plan?.freezeSlots ?? []);
  const fresh = new Set(plan?.freshSlots ?? []);
  const sessionMinutes = plan?.sessionMinutes ?? 0;
  const eveningsMinutes = (result?.recipes.length ?? 1) > 1 ? ((result?.recipes.length ?? 1) - 1) * REHEAT_MINUTES : 0;
  const classicMinutes = result?.recipes.reduce((a, r) => a + r.totalMinutes, 0) ?? 0;
  const lastDay = result ? dayName(result.recipes.length - 1) : "";

  const friendly = recipes
    .filter(isBatchFriendly)
    .filter((r) => (filter === "vegetarien" ? r.tags.includes("vegetarien") : filter === "rapide" ? r.prepMinutes <= 15 : true))
    .sort((a, b) => Number(b.freezable ?? false) - Number(a.freezable ?? false) || (b.fridgeDays ?? 0) - (a.fridgeDays ?? 0) || a.name.localeCompare(b.name, "fr"));

  return (
    <div className="space-y-4">
      {/* Réglages de la session */}
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-caption text-muted">Budget et personnes (réglages du menu)</p>
            <p className="text-body font-semibold tabular-nums">
              {formatEuros(prefs.budgetCents)} · {prefs.persons} pers.
            </p>
          </div>
          <Link href="/" className="link inline-flex min-h-11 items-center gap-1 text-body-sm">
            <Pencil aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Modifier
          </Link>
        </div>
        <Stepper
          label="Soirs à couvrir"
          value={prefs.meals}
          min={2}
          max={14}
          onChange={(v) => set("meals", v)}
          shortcuts={[
            { value: 5, label: "5 soirs" },
            { value: 7, label: "Semaine" },
          ]}
        />
        <div>
          <p className="mb-2 text-caption font-medium text-muted">Jour de la session</p>
          <Segmented label="Jour de la session" value={sessionDay} onChange={setSessionDay} options={SESSION_DAYS} className="[&>button]:px-1.5" />
        </div>
        <div>
          <p className="mb-2 text-caption font-medium text-muted">Temps maximum en cuisine pour la session</p>
          <Segmented
            label="Temps maximum de la session"
            value={String(prefs.batchSessionMinutes)}
            onChange={(v) => set("batchSessionMinutes", Number(v))}
            options={SESSION_LENGTHS}
          />
          <p className="mt-1.5 text-caption text-subtle">
            On choisit des plats qui partagent des ingrédients et qui se cuisent en même temps, pour tout préparer dans ce temps-là.
          </p>
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
            description="Choisissez le jour et le temps dont vous disposez : on compose les repas des soirs suivants, à préparer en une seule session."
          />
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className={cn("rounded-card p-3 shadow-soft ring-1 ring-inset", sessionMinutes <= prefs.batchSessionMinutes ? "bg-surface ring-line" : "bg-warn-soft ring-warn/30")}>
              <dt className="text-caption text-muted">Session</dt>
              <dd className="text-title-3 font-semibold tabular-nums">≈ {duration(sessionMinutes)}</dd>
            </div>
            <div className="rounded-card bg-surface p-3 shadow-soft ring-1 ring-inset ring-line">
              <dt className="text-caption text-muted">Les soirs</dt>
              <dd className="text-title-3 font-semibold tabular-nums">{REHEAT_MINUTES} min</dd>
            </div>
            <div className="rounded-card bg-accent-soft p-3 ring-1 ring-inset ring-accent/25">
              <dt className="text-caption text-muted">Temps gagné</dt>
              <dd className="text-title-3 font-semibold tabular-nums text-accent-text">{duration(Math.max(0, classicMinutes - sessionMinutes - eveningsMinutes))}</dd>
            </div>
          </dl>
          <p className="-mt-2 text-center text-caption text-subtle">
            {result!.recipes.length} repas, du {DAYS[Number(sessionDay)]} soir au {lastDay.toLowerCase()} soir, pour {formatEuros(result!.totalCents)}.
          </p>

          {/* La session */}
          <Card aria-labelledby="session-title">
            <CardHeader
              icon={ChefHat}
              title={<span id="session-title">Session du {DAYS[Number(sessionDay)]}</span>}
              description="Dans cet ordre : lancez d'abord ce qui cuit longtemps, préparez la suite pendant ce temps."
            />
            <ol className="space-y-2">
              {plan!.sharedBases.map((b, k) => (
                <Step key={b.ingredientId} n={k + 1} icon={Wheat} title={`Cuire ${formatQuantity(b.quantity, b.unit)} de ${b.name.toLowerCase()} en une fois`}>
                  Pour {b.slots.length} repas. Laissez refroidir puis répartissez dans les boîtes.
                </Step>
              ))}
              {dishes.map((d, k) => (
                <Step
                  key={d.id}
                  n={plan!.sharedBases.length + k + 1}
                  icon={CookingPot}
                  title={`${d.name}${d.slots.length > 1 ? ` · ${d.slots.length} repas` : ""}`}
                  href={`/recettes/${d.id}?p=${(result!.persons + (result!.lunchPortions ?? 0)) * d.slots.length}`}
                >
                  {d.info ? `${d.info.prepMinutes} min de préparation, ${d.info.cookMinutes} min de cuisson. ` : ""}
                  {d.slots.length * result!.persons} portion{d.slots.length * result!.persons > 1 ? "s" : ""} pour {d.slots.map(dayName).join(", ").toLowerCase()}.
                </Step>
              ))}
              <Step n={plan!.sharedBases.length + dishes.length + 1} icon={Refrigerator} title="Ranger">
                Une boîte par repas, étiquetée avec le jour.{freeze.size > 0 ? ` Au congélateur : ${[...freeze].map(dayName).join(", ").toLowerCase()}.` : " Tout va au frigo."}
              </Step>
            </ol>
            <p className="mt-3 text-caption text-subtle">Estimation : préparations à la suite, jusqu&apos;à 3 cuissons en même temps (four et 2 feux).</p>
            <Button size="lg" fullWidth icon={Play} className="mt-4" loading={sessionLoading} onClick={() => void startSession()}>
              Lancer la session pas à pas
            </Button>
          </Card>
          {session && (
            <CookMode
              recipeName={`Session du ${DAYS[Number(sessionDay)]}`}
              persons={result!.persons}
              ingredients={result!.shoppingList.lines
                .filter((l) => !l.staple)
                .map((l) => ({ id: l.ingredientId, name: l.name, quantity: formatQuantity(l.needed, l.unit), optional: false }))}
              steps={session}
              onClose={() => setSession(null)}
            />
          )}

          {/* Soir par soir */}
          <Card aria-labelledby="week-title">
            <CardHeader icon={CalendarDays} title={<span id="week-title">Soir par soir</span>} />
            <ol className="space-y-2">
              {result!.recipes.map((r, slot) => {
                const info = byId.get(r.recipeId);
                return (
                  <li key={slot} className="flex items-center gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
                    <span className="w-20 shrink-0">
                      <span className="block text-caption text-subtle">{slot === 0 ? "Ce soir" : `J+${slot}`}</span>
                      <span className="block text-body-sm font-semibold">{dayName(slot)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/recettes/${r.recipeId}?p=${result!.persons + (result!.lunchPortions ?? 0)}`} className="focus-ring block truncate rounded font-medium hover:text-accent-text">
                        {r.name}
                      </Link>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {fresh.has(slot) ? (
                          <Badge tone="warn" icon={Timer}>
                            À cuisiner ce soir · {r.totalMinutes} min
                          </Badge>
                        ) : slot === 0 ? (
                          <Badge tone="accent" icon={UtensilsCrossed}>
                            Tout juste prêt
                          </Badge>
                        ) : freeze.has(slot) ? (
                          <Badge tone="accent" icon={Snowflake}>
                            Congelé · sortir la veille
                          </Badge>
                        ) : info?.reheats === false ? (
                          <Badge tone="accent" icon={Refrigerator}>
                            Prêt · à manger en premier
                          </Badge>
                        ) : (
                          <Badge tone="accent" icon={Flame}>
                            Réchauffer · {REHEAT_MINUTES} min
                          </Badge>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
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
