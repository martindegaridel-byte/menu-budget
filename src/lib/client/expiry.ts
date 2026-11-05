/** Urgence d'une date de péremption, pour le badge du placard. */
export type ExpiryTone = "danger" | "warn" | "neutral";

export interface ExpiryInfo {
  days: number;
  tone: ExpiryTone;
  label: string;
}

const DAY = 86_400_000;

/** Jours entre deux dates AAAA-MM-JJ (négatif si dépassée). */
export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / DAY);
}

/** Rouge ≤ 2 jours (ou dépassée), ambre ≤ 5 jours, neutre au-delà. */
export function expiryInfo(dateIso: string, todayIso: string): ExpiryInfo {
  const days = daysUntil(dateIso, todayIso);
  const tone: ExpiryTone = days <= 2 ? "danger" : days <= 5 ? "warn" : "neutral";
  let label: string;
  if (days < 0) label = days === -1 ? "Périmé hier" : `Périmé depuis ${-days} j`;
  else if (days === 0) label = "Aujourd'hui";
  else if (days === 1) label = "Demain";
  else if (days <= 6) label = `Dans ${days} j`;
  else label = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(dateIso));
  return { days, tone, label };
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
