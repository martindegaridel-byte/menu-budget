import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn, ICON_STROKE } from "./cn";

/** État vide illustré : médaillon d'icône, titre, explication, action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  headingLevel = 3,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Niveau du titre selon sa place dans la page (2 si l'état vide suit directement le titre de page). */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="relative mb-5">
        <div aria-hidden className="absolute inset-0 -m-3 rounded-full bg-accent-soft blur-xl" />
        <div className="relative grid size-16 place-items-center rounded-sheet bg-surface-2 text-accent-text shadow-soft ring-1 ring-inset ring-line-strong">
          <Icon aria-hidden className="size-7" strokeWidth={ICON_STROKE} />
        </div>
      </div>
      <Heading className="text-title-3 font-semibold text-fg [text-wrap:balance]">{title}</Heading>
      {description && <p className="mt-1.5 max-w-sm text-body-sm text-muted [text-wrap:pretty]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
