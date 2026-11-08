"use client";
/**
 * Composants historiques des pages, désormais branchés sur le design system
 * (src/components/ds) : mêmes API, nouveau style (tokens, lucide-react).
 */
import { AlertTriangle, Check, Info, Plus, X, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { Button as DsButton, Card as DsCard, Chip, Stepper as DsStepper, type ButtonProps } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { formatEuros } from "@/lib/engine/money";

const cx = cn;

export function Button(props: ButtonProps) {
  return <DsButton {...props} />;
}

export function Card({ as = "section", ...rest }: HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "li"; padded?: boolean }) {
  return <DsCard as={as} {...rest} />;
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  shortcuts,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: (v: number) => string;
  shortcuts?: readonly { value: number; label: string }[];
}) {
  return <DsStepper label={label} value={value} min={min} max={max} onChange={onChange} format={suffix ? (v) => `${v} ${suffix(v)}` : undefined} shortcuts={shortcuts} />;
}

/** Groupe de puces à bascule (sélection multiple), un seul style pour sélectionné / non sélectionné. */
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
  return (
    <fieldset>
      <legend className="mb-2 text-caption font-medium text-muted">{label}</legend>
      {hint && <p className="-mt-1 mb-2 text-caption text-subtle">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map(([value, text]) => (
          <Chip key={value} state={selected.includes(value) ? "selected" : "neutral"} onClick={() => onToggle(value)}>
            {text}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** Jauge total / budget (role="meter") : vert, ambre au-delà de 90 %, rouge si dépassé. */
export function BudgetGauge({ total, budget }: { total: number; budget: number }) {
  const ratio = budget > 0 ? total / budget : total > 0 ? 2 : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const over = total > budget;
  const color = over ? "bg-danger" : ratio > 0.9 ? "bg-warn" : "bg-accent";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-numeric text-title-1 font-semibold tabular-nums text-fg">{formatEuros(total)}</span>
        <span className="text-body-sm text-muted">
          sur <span className="tabular-nums">{formatEuros(budget)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Total du menu par rapport au budget"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={total}
        aria-valuetext={`${formatEuros(total)} sur ${formatEuros(budget)}${over ? ", budget dépassé" : ""}`}
        className="h-2.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div className={cx("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cx("mt-2 text-body-sm font-medium tabular-nums", over ? "text-danger-text" : ratio > 0.9 ? "text-warn-text" : "text-accent-text")}>
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
      className="m-0 mt-auto max-h-[85vh] w-full max-w-none rounded-t-sheet bg-surface p-0 text-fg shadow-lift ring-1 ring-line backdrop:bg-overlay backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-sheet"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <h2 id={id} className="text-title-3 font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="focus-ring grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          <X aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
        </button>
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
  tone = "accent",
}: {
  label: string;
  options: readonly { id: string; name: string }[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  hint?: string;
  /** « danger » pour une liste d'exclusions. */
  tone?: "accent" | "danger";
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
      <label htmlFor={id} className="mb-2 block text-caption font-medium text-muted">
        {label}
      </label>
      {hint && <p className="-mt-1 mb-2 text-caption text-subtle">{hint}</p>}
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
        <DsButton variant="secondary" icon={Plus} onClick={add}>
          Ajouter
        </DsButton>
      </div>
      {selected.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${label} sélectionnés`}>
          {selected.map((s) => (
            <li key={s}>
              <Chip state={tone === "danger" ? "excluded" : "selected"} onClick={() => onChange(selected.filter((x) => x !== s))} aria-label={`Retirer ${names.get(s) ?? s}`}>
                {names.get(s) ?? s}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Notice({ level, children }: { level: "info" | "warning" | "error"; children: ReactNode }) {
  const styles = {
    info: "bg-accent-soft text-fg ring-accent/25",
    warning: "bg-warn-soft text-fg ring-warn/30",
    error: "bg-danger-soft text-fg ring-danger/30",
  };
  const Icon = { info: Info, warning: AlertTriangle, error: XCircle }[level];
  const iconColor = { info: "text-accent-text", warning: "text-warn-text", error: "text-danger-text" }[level];
  return (
    <p className={cx("flex gap-2.5 rounded-field p-3 text-body-sm ring-1 ring-inset", styles[level])}>
      <Icon aria-hidden className={cx("mt-0.5 size-[18px] shrink-0", iconColor)} strokeWidth={ICON_STROKE} />
      <span>{children}</span>
    </p>
  );
}

export { Check, cx };
