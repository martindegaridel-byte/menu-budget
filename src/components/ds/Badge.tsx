import { AlertTriangle, CalendarClock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { expiryInfo } from "@/lib/client/expiry";
import { cn, ICON_STROKE } from "./cn";

export type BadgeTone = "neutral" | "accent" | "warn" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent-text ring-accent/30",
  warn: "bg-warn-soft text-warn-text ring-warn/30",
  danger: "bg-danger-soft text-danger-text ring-danger/30",
};

export function Badge({ tone = "neutral", icon: Icon, children, className }: { tone?: BadgeTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-caption font-medium ring-1 ring-inset", TONES[tone], className)}>
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={ICON_STROKE} />}
      {children}
    </span>
  );
}

/** Badge de péremption : rouge ≤ 2 j (ou dépassé), ambre ≤ 5 j, neutre sinon. */
export function ExpiryBadge({ date, today, className }: { date: string; today: string; className?: string }) {
  const info = expiryInfo(date, today);
  return (
    <Badge tone={info.tone} icon={info.tone === "neutral" ? CalendarClock : AlertTriangle} className={className}>
      <span className="sr-only">À consommer : </span>
      {info.label}
    </Badge>
  );
}
