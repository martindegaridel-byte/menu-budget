import webpush from "web-push";
import type { Notification } from "@/lib/reminders";
import { prisma } from "./db";

/**
 * Notifications push (rappels). Clés VAPID : variables d'environnement si présentes,
 * sinon générées une fois et gardées dans la base (aucune configuration nécessaire).
 */
let cached: { publicKey: string; privateKey: string } | null = null;

export async function getVapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: "vapid" } });
  if (row) return (cached = JSON.parse(row.value) as { publicKey: string; privateKey: string });
  const keys = webpush.generateVAPIDKeys();
  try {
    await prisma.appSetting.create({ data: { key: "vapid", value: JSON.stringify(keys) } });
    return (cached = keys);
  } catch {
    // Créées entre-temps par une autre requête : on relit.
    const again = await prisma.appSetting.findUniqueOrThrow({ where: { key: "vapid" } });
    return (cached = JSON.parse(again.value) as { publicKey: string; privateKey: string });
  }
}

const SUBJECT = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "menu-budget.app"}`;

/** Envoie une notification ; renvoie false si l'abonnement n'existe plus (à supprimer). */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, n: Notification): Promise<boolean> {
  const { publicKey, privateKey } = await getVapidKeys();
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(n), {
      vapidDetails: { subject: SUBJECT, publicKey, privateKey },
      TTL: 6 * 3600,
      urgency: "normal",
    });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    throw e;
  }
}
