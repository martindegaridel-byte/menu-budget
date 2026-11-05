"use client";
import { Check, CircleDashed, X } from "lucide-react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn, ICON_STROKE } from "./cn";

/**
 * - selected : choisi (accent, coche)
 * - neutral  : non choisi
 * - excluded : exclu (rouge doux, croix)
 * - partial  : exclu en partie (rouge doux en pointillé, icône distincte + infobulle)
 */
export type ChipState = "selected" | "neutral" | "excluded" | "partial";

const STATE_STYLES: Record<ChipState, string> = {
  selected: "bg-accent-soft text-accent-text ring-accent/40",
  neutral: "bg-surface-2 text-fg ring-line-strong hover:bg-surface-3",
  excluded: "bg-danger-soft text-danger-text ring-danger/40",
  partial: "bg-transparent text-danger-text ring-0 outline-dashed outline-1 -outline-offset-1 outline-danger/60 hover:bg-danger-soft",
};

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  state: ChipState;
  children: ReactNode;
  /** Explication affichée au survol / au focus (utile pour « partiel »). */
  hint?: string;
}

export function Chip({ state, children, hint, className, ...rest }: ChipProps) {
  const hintId = useId();
  const pressed = state === "selected" || state === "excluded" ? true : state === "partial" ? "mixed" : false;
  const Icon = state === "selected" ? Check : state === "excluded" ? X : state === "partial" ? CircleDashed : null;
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-pressed={pressed}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          "focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-body-sm font-medium ring-1 ring-inset",
          "transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
          STATE_STYLES[state],
          className,
        )}
        {...rest}
      >
        {Icon && <Icon key={state} aria-hidden className="size-4 animate-pop" strokeWidth={ICON_STROKE} />}
        <span>{children}</span>
      </button>
      {hint && (
        <span
          id={hintId}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-60 -translate-x-1/2 rounded-field bg-surface-3 px-3 py-2 text-caption text-fg shadow-lift ring-1 ring-line-strong",
            "invisible opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100",
          )}
        >
          {hint}
        </span>
      )}
    </span>
  );
}
