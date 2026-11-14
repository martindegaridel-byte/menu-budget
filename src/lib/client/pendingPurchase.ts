import type { PantryItem } from "@/lib/domain/schemas";
import type { ShoppingList } from "@/lib/engine/types";
import { pantryAfterPurchase } from "./shopping";

/**
 * « J'ai fait mes courses » sans réseau (au magasin, souvent) : l'achat est mis en attente dans le
 * navigateur, puis ajouté au placard dès le retour de la connexion. Rien n'est perdu.
 */
export const PENDING_PURCHASE_KEY = "mb:pending-purchase";

export interface PendingPurchase {
  menuKey: string;
  /** Date des courses (AAAA-MM-JJ) : sert aux dates de péremption estimées. */
  date: string;
  list: ShoppingList;
  pantrySavingsCents: number;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export function readPending(storage: Storage): PendingPurchase | null {
  try {
    const raw = storage.getItem(PENDING_PURCHASE_KEY);
    const p = raw ? (JSON.parse(raw) as PendingPurchase) : null;
    return p && typeof p.menuKey === "string" && Array.isArray(p.list?.lines) ? p : null;
  } catch {
    return null;
  }
}

export function savePending(storage: Storage, p: PendingPurchase): void {
  try {
    storage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : l'utilisateur réessaiera */
  }
}

/**
 * Applique un achat en attente : placard relu sur le serveur (il a pu changer), ajout des achats,
 * enregistrement, puis la file est vidée. Renvoie l'achat appliqué, ou null s'il n'y en avait pas.
 * En cas d'échec (toujours hors ligne), l'achat reste en attente.
 */
/** Application en cours : un second appel simultané (retour du réseau + ouverture de l'appli) l'attend sans rien refaire. */
let inFlight: Promise<PendingPurchase | null> | null = null;

export function applyPending(
  storage: Storage,
  deps: Parameters<typeof applyPendingOnce>[1],
): Promise<PendingPurchase | null> {
  // Le second appelant attend la fin mais n'a rien appliqué lui-même (pas de double message).
  if (inFlight) return inFlight.then(() => null, () => null);
  inFlight = applyPendingOnce(storage, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function applyPendingOnce(
  storage: Storage,
  deps: {
    getPantry: () => Promise<{ items: PantryItem[] }>;
    putPantry: (items: PantryItem[]) => Promise<unknown>;
    onApplied?: (p: PendingPurchase) => void;
  },
): Promise<PendingPurchase | null> {
  const p = readPending(storage);
  if (!p) return null;
  const { items } = await deps.getPantry();
  await deps.putPantry(pantryAfterPurchase(items, p.list, p.date));
  storage.removeItem(PENDING_PURCHASE_KEY);
  deps.onApplied?.(p);
  return p;
}
