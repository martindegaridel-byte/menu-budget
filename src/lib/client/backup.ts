/** Réglages de l'appareil inclus dans la sauvegarde (clés « mb:* » du navigateur). */

/** Propres à cet appareil : on ne les transfère pas. */
const DEVICE_ONLY = new Set(["mb:push-endpoint", "mb:result"]);

export function deviceSettings(storage: Pick<Storage, "length" | "key" | "getItem">): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !/^mb:[a-z0-9:-]+$/.test(k) || DEVICE_ONLY.has(k)) continue;
    const v = storage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function restoreDeviceSettings(storage: Pick<Storage, "setItem">, settings: Record<string, string>): number {
  let n = 0;
  for (const [k, v] of Object.entries(settings)) {
    if (!/^mb:[a-z0-9:-]+$/.test(k) || DEVICE_ONLY.has(k)) continue;
    storage.setItem(k, v);
    n++;
  }
  return n;
}

export const backupFileName = (d = new Date()) => `popote-${d.toISOString().slice(0, 10)}.json`;
