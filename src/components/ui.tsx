"use client";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatEuros } from "@/lib/engine/money";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50",
  secondary:
    "bg-white text-stone-900 ring-1 ring-stone-300 hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-600 dark:hover:bg-stone-700",
  ghost: "text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-stone-800",
  danger: "text-red-700 ring-1 ring-red-300 hover:bg-red-50 dark:text-red-300 dark:ring-red-800 dark:hover:bg-red-950",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "min-h-11 px-4",
        size === "lg" && "min-h-12 px-5 text-lg",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li"; "aria-labelledby"?: string }) {
  return (
    <As {...rest} className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800", className)}>
      {children}
    </As>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <span id={id} className="mb-1 block text-sm font-medium">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-2">
        <Button variant="secondary" size="sm" aria-label={`Diminuer : ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </Button>
        <output aria-live="polite" className="min-w-16 text-center text-lg font-semibold tabular-nums">
          {value}
          {suffix ? ` ${suffix(value)}` : ""}
        </output>
        <Button variant="secondary" size="sm" aria-label={`Augmenter : ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </Button>
      </div>
    </div>
  );
}

/** Groupe de puces à bascule (sélection simple ou multiple). */
export function Chips<T extends string>({
  label,
  options,
  selected,
  onToggle,
  hint,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <fieldset>
      <legend id={id} className="mb-1 text-sm font-medium">
        {label}
      </legend>
      {hint && <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map(([value, text]) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(value)}
              className={cx(
                "min-h-9 rounded-full px-3 text-sm ring-1 transition focus-visible:outline-2 focus-visible:outline-emerald-600",
                on
                  ? "bg-emerald-700 text-white ring-emerald-700"
                  : "bg-white text-stone-800 ring-stone-300 hover:bg-stone-50 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600",
              )}
            >
              {on && <span aria-hidden>✓ </span>}
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Jauge total / budget (role="meter"). */
export function BudgetGauge({ total, budget }: { total: number; budget: number }) {
  const ratio = budget > 0 ? total / budget : total > 0 ? 2 : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const over = total > budget;
  const color = over ? "bg-red-600" : ratio > 0.9 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{formatEuros(total)}</span>
        <span className="text-sm text-stone-600 dark:text-stone-400">sur {formatEuros(budget)}</span>
      </div>
      <div
        role="meter"
        aria-label="Total du menu par rapport au budget"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={total}
        aria-valuetext={`${formatEuros(total)} sur ${formatEuros(budget)}${over ? ", budget dépassé" : ""}`}
        className="h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
      >
        <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cx("mt-1 text-sm font-medium", over ? "text-red-700 dark:text-red-400" : "text-emerald-800 dark:text-emerald-300")}>
        {over ? `Dépassement : ${formatEuros(total - budget)}` : `Reste ${formatEuros(budget - total)}`}
      </p>
    </div>
  );
}

/** Feuille modale accessible (élément <dialog> natif : focus piégé, Échap pour fermer). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[85vh] w-full max-w-none rounded-t-3xl bg-white p-0 text-stone-900 backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-inherit px-4 py-3 dark:border-stone-800">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer">
          ✕
        </Button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}

/** Sélecteur d'ingrédients avec recherche (liste de suggestions native). */
export function IngredientPicker({
  label,
  options,
  selected,
  onChange,
  hint,
}: {
  label: string;
  options: readonly { id: string; name: string }[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  hint?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const byName = new Map(options.map((o) => [o.name.toLowerCase(), o.id]));
  const names = new Map(options.map((o) => [o.id, o.name]));
  const add = () => {
    const found = byName.get(q.trim().toLowerCase());
    if (found && !selected.includes(found)) onChange([...selected, found]);
    if (found) setQ("");
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {hint && <p className="mb-2 text-xs text-stone-600 dark:text-stone-400">{hint}</p>}
      <div className="flex gap-2">
        <input
          id={id}
          list={`${id}-list`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Rechercher un ingrédient…"
          className="input flex-1"
        />
        <datalist id={`${id}-list`}>
          {options.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
        <Button variant="secondary" onClick={add}>
          Ajouter
        </Button>
      </div>
      {selected.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${label} sélectionnés`}>
          {selected.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== s))}
                className="min-h-8 rounded-full bg-stone-100 px-3 text-sm ring-1 ring-stone-300 hover:bg-red-50 dark:bg-stone-800 dark:ring-stone-600"
                aria-label={`Retirer ${names.get(s) ?? s}`}
              >
                {names.get(s) ?? s} <span aria-hidden>✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Notice({ level, children }: { level: "info" | "warning" | "error"; children: ReactNode }) {
  const styles = {
    info: "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900",
    warning: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900",
    error: "bg-red-50 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-900",
  };
  const icon = { info: "ℹ️", warning: "⚠️", error: "⛔" };
  return (
    <p className={cx("flex gap-2 rounded-xl p-3 text-sm ring-1", styles[level])}>
      <span aria-hidden>{icon[level]}</span>
      <span>{children}</span>
    </p>
  );
}

export { cx };
