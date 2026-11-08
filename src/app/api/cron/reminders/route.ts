import { composeNotification, parisToday, ScheduleSchema } from "@/lib/reminders";
import { getCatalog } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/db";
import { HttpError, route } from "@/lib/server/http";
import { sendPush } from "@/lib/server/push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Tâche quotidienne (Vercel Cron, vers 17 h) : envoie à chaque abonné le rappel du jour.
 * Réservée à Vercel : jeton CRON_SECRET s'il est défini, sinon l'agent « vercel-cron ».
 */
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const authorized = secret ? req.headers.get("authorization") === `Bearer ${secret}` : (req.headers.get("user-agent") ?? "").includes("vercel-cron");
  if (!authorized) throw new HttpError(401, "Non autorisé");

  const today = parisToday();
  const { ingredientsById } = await getCatalog();
  const subs = await prisma.pushSubscription.findMany();
  const userIds = [...new Set(subs.map((s) => s.userId))];
  const pantry = await prisma.pantryItem.findMany({ where: { userId: { in: userIds }, expiresOn: { not: null } } });
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    const parsed = ScheduleSchema.safeParse(JSON.parse(sub.scheduleJson));
    const expiring = pantry
      .filter((p) => p.userId === sub.userId && p.expiresOn)
      .map((p) => ({ name: ingredientsById.get(p.ingredientId)?.name ?? p.ingredientId, days: daysBetween(today, p.expiresOn!) }));
    const n = composeNotification(parsed.success ? parsed.data : [], expiring, today);
    if (!n) continue;
    try {
      if (await sendPush(sub, n)) sent++;
      else {
        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
        removed++;
      }
    } catch (e) {
      console.error("Rappel non envoyé", e);
    }
  }
  return { today, subscriptions: subs.length, sent, removed };
});
