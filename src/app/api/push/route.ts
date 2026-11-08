import { PushEndpointSchema, PushScheduleSchema, PushSubscribeSchema } from "@/lib/domain/api";
import { prisma } from "@/lib/server/db";
import { parseBody, route } from "@/lib/server/http";
import { getVapidKeys } from "@/lib/server/push";
import { getCurrentUserId } from "@/lib/server/user";

/** Clé publique pour s'abonner aux rappels. */
export const GET = route(async () => ({ publicKey: (await getVapidKeys()).publicKey }));

/** S'abonner aux rappels (ou mettre à jour l'abonnement) avec le programme prévu. */
export const POST = route(async (req: Request) => {
  const { subscription, schedule } = await parseBody(req, PushSubscribeSchema);
  const userId = await getCurrentUserId();
  const data = { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, scheduleJson: JSON.stringify(schedule) };
  await prisma.pushSubscription.upsert({ where: { endpoint: subscription.endpoint }, create: { endpoint: subscription.endpoint, ...data }, update: data });
  return { ok: true };
});

/** Mettre à jour le programme des rappels (planning modifié). */
export const PUT = route(async (req: Request) => {
  const { endpoint, schedule } = await parseBody(req, PushScheduleSchema);
  const userId = await getCurrentUserId();
  const { count } = await prisma.pushSubscription.updateMany({ where: { endpoint, userId }, data: { scheduleJson: JSON.stringify(schedule) } });
  return { ok: count > 0 };
});

/** Se désabonner. */
export const DELETE = route(async (req: Request) => {
  const { endpoint } = await parseBody(req, PushEndpointSchema);
  const userId = await getCurrentUserId();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return { ok: true };
});
