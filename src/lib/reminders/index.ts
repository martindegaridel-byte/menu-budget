import { z } from "zod";

/** Rappels du soir : plat prévu, décongélation à prévoir, produits qui périment. */

export const ReminderEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["dinner", "thaw"]),
  text: z.string().min(1).max(120),
  url: z.string().max(300).default("/"),
});
export type ReminderEntry = z.infer<typeof ReminderEntrySchema>;
export const ScheduleSchema = z.array(ReminderEntrySchema).max(60);

export interface Notification {
  title: string;
  body: string;
  url: string;
}

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
};

/** Date du jour à Paris (AAAA-MM-JJ). */
export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Programme des rappels à partir du planning : « Ce soir : X » le jour prévu, et pour
 * un plat congelé (batch cooking) « Sortez X du congélateur » la veille.
 */
export function scheduleFromPlanning(
  evenings: readonly { date: string; slot: number; recipeId: string; name: string }[],
  opts: { freezeSlots?: readonly number[]; persons: number },
): ReminderEntry[] {
  const freeze = new Set(opts.freezeSlots ?? []);
  const out: ReminderEntry[] = [];
  for (const e of evenings) {
    const url = `/recettes/${e.recipeId}?p=${opts.persons}`;
    out.push({ date: e.date, kind: "dinner", text: e.name.slice(0, 120), url });
    if (freeze.has(e.slot)) out.push({ date: addDays(e.date, -1), kind: "thaw", text: e.name.slice(0, 120), url });
  }
  return out.slice(0, 60);
}

/** Notification du jour (null s'il n'y a rien à rappeler). */
export function composeNotification(schedule: readonly ReminderEntry[], expiring: readonly { name: string; days: number }[], today: string): Notification | null {
  const dinner = schedule.find((e) => e.date === today && e.kind === "dinner");
  const thaw = schedule.filter((e) => e.date === today && e.kind === "thaw");
  const soon = expiring.filter((x) => x.days >= 0 && x.days <= 1);
  const lines: string[] = [];
  for (const t of thaw) lines.push(`Sortez « ${t.text} » du congélateur pour demain.`);
  if (soon.length) {
    const names = soon.map((x) => x.name.toLowerCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names.at(-1)}` : names[0]!;
    lines.push(`À utiliser vite : ${list} (${soon.some((x) => x.days === 0) ? "aujourd'hui" : "demain"}).`);
  }
  if (!dinner && lines.length === 0) return null;
  return {
    title: dinner ? `Ce soir : ${dinner.text}` : "Popote",
    body: lines.length ? lines.join(" ") : "Bon appétit ! Touchez pour voir la recette.",
    url: dinner?.url ?? (soon.length ? "/placard" : (thaw[0]?.url ?? "/")),
  };
}
