"use client";
import type { ReminderEntry } from "@/lib/reminders";

/** Abonnement aux rappels (notifications push) depuis le navigateur. */
export const PUSH_ENDPOINT_KEY = "mb:push-endpoint";

export type PushSupport = "ok" | "install-first" | "unsupported" | "denied";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
    return ios ? "install-first" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone ? "install-first" : "ok";
}

export const savedEndpoint = (): string | null => {
  try {
    return localStorage.getItem(PUSH_ENDPOINT_KEY);
  } catch {
    return null;
  }
};

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}

/** Demande l'autorisation, s'abonne et envoie le programme des rappels. */
export async function enableReminders(schedule: ReminderEntry[]): Promise<void> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées : autorisez-les dans les réglages du téléphone pour Popote.");
  const { publicKey } = await json<{ publicKey: string }>(await fetch("/api/push"));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const body = sub.toJSON();
  await json(await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: { endpoint: body.endpoint, keys: body.keys }, schedule }) }));
  try {
    localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint);
  } catch {
    /* stockage indisponible */
  }
}

export async function disableReminders(): Promise<void> {
  const endpoint = savedEndpoint();
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => undefined);
  if (endpoint) await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) }).catch(() => undefined);
  try {
    localStorage.removeItem(PUSH_ENDPOINT_KEY);
  } catch {
    /* ignore */
  }
}

/** Met à jour le programme côté serveur (planning modifié), si les rappels sont activés. */
export async function syncSchedule(schedule: ReminderEntry[]): Promise<void> {
  const endpoint = savedEndpoint();
  if (!endpoint) return;
  await fetch("/api/push", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint, schedule }) }).catch(() => undefined);
}

export async function sendTestReminder(): Promise<void> {
  const endpoint = savedEndpoint();
  if (!endpoint) throw new Error("Rappels non activés sur cet appareil.");
  await json(await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) }));
}
