"use client";
import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { cn, ICON_STROKE } from "./cn";

/** Compteur compact (personnes, repas…) avec raccourcis optionnels. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  shortcuts,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Texte affiché à la place du nombre brut (ex. « 4 pers. »). */
  format?: (v: number) => string;
  /** Valeurs proposées en un tap (ex. [1, 2, 4]). */
  shortcuts?: readonly { value: number; label: string }[];
  className?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn =
    "focus-ring grid size-11 place-items-center rounded-full text-fg transition-[background-color,transform] duration-150 hover:bg-surface-3 active:scale-90 disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span id={id} className="text-caption font-medium text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-labelledby={id} className="inline-flex items-center rounded-full bg-surface-2 p-0.5 ring-1 ring-inset ring-line">
          <button type="button" className={btn} aria-label={`Moins (${label})`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
            <Minus aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
          </button>
          <output aria-live="polite" className="min-w-16 px-1 text-center text-body font-semibold tabular-nums text-fg">
            {format ? format(value) : value}
          </output>
          <button type="button" className={btn} aria-label={`Plus (${label})`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
            <Plus aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
          </button>
        </div>
        {shortcuts?.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={value === s.value}
            onClick={() => onChange(clamp(s.value))}
            className={cn(
              "focus-ring min-h-11 rounded-full px-3 text-caption font-medium ring-1 ring-inset transition-colors duration-150",
              value === s.value ? "bg-accent-soft text-accent-text ring-accent/40" : "text-muted ring-line hover:bg-surface-2 hover:text-fg",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
