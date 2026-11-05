import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_STROKE } from "@/components/ds/cn";

/** En-tête de page commun : médaillon d'icône, titre, sous-titre, action éventuelle. */
export function PageHeader({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/20">
        <Icon aria-hidden className="size-[22px]" strokeWidth={ICON_STROKE} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-title-1 font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
