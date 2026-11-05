"use client";
import type { LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { cn, ICON_STROKE } from "./cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Choix unique (régime, niveau…) : groupe de boutons radio, flèches du clavier. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-[14px] bg-surface-2 p-1 ring-1 ring-inset ring-line", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-field px-3 text-body-sm font-medium",
              "transition-[background-color,color,box-shadow] duration-150",
              active ? "bg-surface-3 text-fg shadow-soft ring-1 ring-inset ring-line-strong" : "text-muted hover:text-fg",
            )}
          >
            {Icon && <Icon aria-hidden className={cn("size-4", active && "text-accent-text")} strokeWidth={ICON_STROKE} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
