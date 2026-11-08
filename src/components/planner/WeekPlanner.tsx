"use client";
import { ArrowDown, ArrowUp, CalendarPlus, Clock, GripVertical } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Card, IconButton, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { todayIso } from "@/lib/client/expiry";
import { buildIcs, move, plannedEvenings, planningFor, PLANNING_KEY, type Planning } from "@/lib/client/planning";
import { usePersistentState } from "@/lib/client/storage";
import type { MenuResult } from "@/lib/engine/optimize";
import { scheduleFromPlanning } from "@/lib/reminders";
import { RemindersCard } from "./RemindersCard";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Onglet « Semaine » : un plat par soir, réorganisable (glisser ou flèches), export calendrier. */
export function WeekPlanner({ result, menuKey, onChange }: { result: MenuResult; menuKey: string; onChange?: (p: Planning) => void }) {
  const [stored, setStored] = usePersistentState<Planning | null>(PLANNING_KEY, null);
  const planning = planningFor(stored, menuKey, result.recipes.length, todayIso());
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const toast = useToast();
  const evenings = plannedEvenings(planning, result.recipes);
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
        <Button variant="secondary" icon={CalendarPlus} onClick={exportIcs}>
          Ajouter à mon calendrier
        </Button>
      </Card>
      <RemindersCard schedule={schedule} />
      <p className="text-caption text-subtle">Glissez la poignée ou utilisez les flèches pour changer de jour.</p>
      <ol ref={listRef} className="space-y-2" aria-label="Planning des dîners">
        {evenings.map((e) => {
          const r = result.recipes[e.slot]!;
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
                <Link href={`/recettes/${r.recipeId}?p=${result.persons + (result.lunchPortions ?? 0)}`} className="focus-ring block truncate rounded font-medium hover:text-accent-text">
                  {r.name}
                </Link>
                <Badge icon={Clock} className="mt-1">
                  {r.totalMinutes} min
                </Badge>
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
