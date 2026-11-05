"use client";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn, ICON_STROKE } from "./cn";

type CardTag = "section" | "div" | "article" | "li";

export function Card({
  as: Tag = "div",
  padded = true,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: CardTag; padded?: boolean }) {
  return (
    <Tag className={cn("rounded-card bg-surface shadow-soft ring-1 ring-inset ring-line", padded && "p-4 sm:p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, icon: Icon, action }: { title: ReactNode; description?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-field bg-accent-soft text-accent-text">
          <Icon aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-title-3 font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Carte repliable : l'en-tête est un bouton (aria-expanded) ; un résumé s'affiche quand elle est fermée. */
export function CollapsibleCard({
  title,
  summary,
  icon: Icon,
  step,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
  className,
}: {
  title: string;
  summary?: ReactNode;
  icon?: LucideIcon;
  /** Numéro d'étape affiché dans le médaillon (quand l'ordre a du sens). */
  step?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const panelId = useId();
  const toggle = () => {
    setInner(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className={cn("rounded-sheet bg-surface shadow-soft ring-1 ring-inset ring-line", className)}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="focus-ring flex min-h-16 w-full items-center gap-3 rounded-sheet px-4 py-3 text-left sm:px-5"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-field bg-accent-soft text-body-sm font-semibold tabular-nums text-accent-text">
            {Icon ? <Icon aria-hidden className="size-[18px]" strokeWidth={ICON_STROKE} /> : step}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-title-3 font-semibold text-fg">{title}</span>
            {!open && summary && <span className="mt-0.5 block truncate text-body-sm text-muted">{summary}</span>}
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-5 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")}
            strokeWidth={ICON_STROKE}
          />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="px-4 pb-5 sm:px-5">
        {children}
      </div>
    </section>
  );
}
