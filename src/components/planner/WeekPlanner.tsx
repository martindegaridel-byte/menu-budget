"use client";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarPlus, Clock, CookingPot, GripVertical, Refrigerator, Snowflake, Soup } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Card, IconButton, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { todayIso } from "@/lib/client/expiry";
import { buildIcs, move, plannedEvenings, planningFor, PLANNING_KEY, type Planning } from "@/lib/client/planning";
import type { RecipeSummary } from "@/lib/client/catalog-types";
import { usePersistentState } from "@/lib/client/storage";
import { dayStatuses, nextWeekday, sessionDishes, type DayKind } from "@/lib/client/weekPlan";
import type { MenuResult } from "@/lib/engine/optimize";
import { scheduleFromPlanning } from "@/lib/reminders";
import { RemindersCard } from "./RemindersCard";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const short = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`);

const KIND_BADGE: Record<DayKind, { label: string; icon: typeof Soup; tone: "neutral" | "accent" }> = {
  frais: { label: "Cuisiné ce soir", icon: Soup, tone: "neutral" },
  session: { label: "Cuisiné aujourd'hui (session)", icon: CookingPot, tone: "accent" },
  reheat: { label: "Réchauffé", icon: Refrigerator, tone: "accent" },
  congel: { label: "Du congélateur", icon: Snowflake, tone: "accent" },
};

/** Onglet « Semaine » : un plat par soir, réorganisable (glisser ou flèches), export calendrier. */
export function WeekPlanner({ result, menuKey, recipes, onChange }: { result: MenuResult; menuKey: string; recipes?: ReadonlyMap<string, RecipeSummary>; onChange?: (p: Planning) => void }) {
  const [stored, setStored] = usePersistentState<Planning | null>(PLANNING_KEY, null);
  const planning = planningFor(stored, menuKey, result.recipes.length, todayIso());
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const toast = useToast();
  const evenings = plannedEvenings(planning, result.recipes);
  const plan = result.prepPlan;
  const statuses = dayStatuses(evenings, plan, (id) => recipes?.get(id)?.fridgeDays);
  const dishes = plan ? sessionDishes(evenings, statuses) : [];
  const schedule = scheduleFromPlanning(evenings, { freezeSlots: result.prepPlan?.freezeSlots ?? [], persons: result.persons });

  const save = (p: Planning) => {
    setStored(p);
    onChange?.(p);
  };
  useEffect(() => {
    onChange?.(planning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuKey, planning.start, planning.order.join(",")]);

  // Glisser-déposer à la poignée (souris et doigt).
  const onDown = (e: ReactPointerEvent, day: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(day);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (dragging === null) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-day]");
    const target = row ? Number(row.dataset.day) : null;
    if (target === null || target === dragging || !listRef.current?.contains(row!)) return;
    save({ ...planning, order: move(planning.order, dragging, target) });
    setDragging(target);
  };

  const exportIcs = () => {
    const ics = buildIcs(evenings, { origin: window.location.origin, persons: result.persons });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-de-la-semaine.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast({ title: "Calendrier exporté", description: "Ouvrez le fichier pour ajouter les dîners à votre calendrier.", tone: "success" });
  };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="plan-start" className="mb-2 block text-caption font-medium text-muted">
            Premier dîner le
          </label>
          <input id="plan-start" type="date" className="input w-44" value={planning.start} onChange={(e) => e.target.value && save({ ...planning, start: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {plan && (
            <Button variant="secondary" onClick={() => save({ ...planning, start: nextWeekday(todayIso(), 0) })}>
              Session dimanche
            </Button>
          )}
          <Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>
            Ajouter à mon calendrier
          </Button>
        </div>
      </Card>
      {plan && dishes.length > 0 ? (
        <Card aria-labelledby="session-title" className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-field bg-accent-soft text-accent-text">
              <CookingPot aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
            </span>
            <div>
              <h2 id="session-title" className="text-title-3 font-semibold">
                Session de batch · <span className="capitalize">{dayFmt.format(parse(planning.start))}</span> {dateFmt.format(parse(planning.start))}
              </h2>
              <p className="text-caption text-muted">Environ {hours(plan.sessionMinutes)} de cuisine, puis seulement du réchauffage.</p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {dishes.map((d) => (
              <li key={d.recipeId} className="rounded-field bg-surface-2 p-3 text-body-sm ring-1 ring-inset ring-line">
                <span className="font-semibold">{d.name}</span>
                <span className="text-muted"> : {d.days.length > 1 ? `pour ${d.dates.map((x) => short.format(parse(x))).join(", ")}` : `pour ${short.format(parse(d.dates[0]!))}`}</span>
              </li>
            ))}
          </ul>
          <Link href="/batch" className="focus-ring inline-flex min-h-11 items-center rounded-field text-body-sm font-medium text-accent-text hover:underline">
            Lancer la session pas à pas
          </Link>
        </Card>
      ) : (
        <p className="rounded-field bg-surface-2 p-3 text-caption text-muted ring-1 ring-inset ring-line">
          Chaque plat est cuisiné le soir même. Pour cuisiner une seule fois le dimanche et réchauffer ensuite, activez le batch cooking dans les préférences (onglet Menu) ou ouvrez l&apos;onglet{" "}
          <Link href="/batch" className="font-medium text-accent-text underline">
            Batch
          </Link>
          .
        </p>
      )}
      <RemindersCard schedule={schedule} />
      <p className="text-caption text-subtle">Glissez la poignée ou utilisez les flèches pour changer de jour.</p>
      <ol ref={listRef} className="space-y-2" aria-label="Planning des dîners">
        {evenings.map((e) => {
          const r = result.recipes[e.slot]!;
          const st = statuses[e.day]!;
          const badge = KIND_BADGE[st.kind];
          return (
            <li
              key={`${e.slot}-${e.day}`}
              data-day={e.day}
              className={cn(
                "flex items-center gap-2 rounded-card bg-surface p-2 shadow-soft ring-1 ring-inset transition-shadow duration-150",
                dragging === e.day ? "ring-accent shadow-lift" : "ring-line",
              )}
            >
              <button
                type="button"
                aria-label={`Déplacer ${r.name} (glisser)`}
                onPointerDown={(ev) => onDown(ev, e.day)}
                onPointerMove={onMove}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
                className="focus-ring grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-field text-subtle hover:bg-surface-2 active:cursor-grabbing"
              >
                <GripVertical aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
              </button>
              <div className="w-20 shrink-0">
                <p className="text-body-sm font-semibold capitalize">{dayFmt.format(parse(e.date))}</p>
                <p className="text-caption text-muted">{dateFmt.format(parse(e.date))}</p>
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/recettes/${r.recipeId}?p=${result.persons + (result.lunchPortions ?? 0)}`} className="focus-ring relative before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] block rounded font-medium hover:text-accent-text">
                  <span className="block truncate">{r.name}</span>
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge icon={badge.icon} tone={badge.tone}>
                    {st.kind === "reheat" ? `Réchauffé · cuisiné ${st.daysAfter} j avant` : badge.label}
                  </Badge>
                  <Badge icon={Clock}>{st.kind === "reheat" || st.kind === "congel" ? "5 min" : `${r.totalMinutes} min`}</Badge>
                  {st.late && (
                    <Badge tone="warn" icon={AlertTriangle}>
                      Se garde mal jusque-là
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col">
                <IconButton icon={ArrowUp} label={`Avancer ${r.name} d'un jour`} className="size-9" disabled={e.day === 0} onClick={() => save({ ...planning, order: move(planning.order, e.day, e.day - 1) })} />
                <IconButton
                  icon={ArrowDown}
                  label={`Reculer ${r.name} d'un jour`}
                  className="size-9"
                  disabled={e.day === evenings.length - 1}
                  onClick={() => save({ ...planning, order: move(planning.order, e.day, e.day + 1) })}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
