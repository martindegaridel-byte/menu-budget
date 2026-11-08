import { PushEndpointSchema } from "@/lib/domain/api";
import { prisma } from "@/lib/server/db";
import { HttpError, parseBody, route } from "@/lib/server/http";
import { sendPush } from "@/lib/server/push";
import { getCurrentUserId } from "@/lib/server/user";

/** Envoie tout de suite une notification de test. */
export const POST = route(async (req: Request) => {
  const { endpoint } = await parseBody(req, PushEndpointSchema);
  const userId = await getCurrentUserId();
  const sub = await prisma.pushSubscription.findFirst({ where: { endpoint, userId } });
  if (!sub) throw new HttpError(404, "Rappels non activés sur cet appareil.");
  const ok = await sendPush(sub, { title: "Rappels activés", body: "Vous recevrez chaque jour vers 17 h le plat du soir et les produits à utiliser vite.", url: "/" });
  if (!ok) {
    await prisma.pushSubscription.delete({ where: { endpoint } });
    throw new HttpError(410, "Abonnement expiré : réactivez les rappels.");
  }
  return { ok: true };
});
