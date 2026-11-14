import { describe, expect, it } from "vitest";
import type { PantryItem } from "@/lib/domain/schemas";
import type { ShoppingList } from "@/lib/engine/types";
import { applyPending, PENDING_PURCHASE_KEY, readPending, savePending } from "./pendingPurchase";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const list = {
  lines: [{ ingredientId: "riz-long", name: "Riz", aisle: "epicerie-salee", unit: "g", needed: 300, fromPantry: 0, toBuy: 300, picks: [], purchased: 1000, leftover: 700, costCents: 145, usedCostCents: 44, staple: false }],
  totalCents: 145,
  usedCostCents: 44,
  unavailable: [],
} as ShoppingList;

describe("achat en attente (hors connexion)", () => {
  it("garde l'achat puis l'ajoute au placard au retour du réseau, et vide la file", async () => {
    const s = memory();
    savePending(s, { menuKey: "m1", date: "2026-11-14", list, pantrySavingsCents: 120 });
    expect(readPending(s)?.menuKey).toBe("m1");
    let saved: PantryItem[] = [];
    let applied = "";
    const done = await applyPending(s, {
      getPantry: async () => ({ items: [{ ingredientId: "sel", quantity: null }] }),
      putPantry: async (items) => void (saved = items),
      onApplied: (p) => void (applied = p.menuKey),
    });
    expect(done?.menuKey).toBe("m1");
    expect(applied).toBe("m1");
    expect(saved.find((i) => i.ingredientId === "riz-long")?.quantity).toBe(1000); // tout l'achat ; « Cuisiné » retire ensuite ce qui sert
    expect(saved.some((i) => i.ingredientId === "sel")).toBe(true);
    expect(s.m.has(PENDING_PURCHASE_KEY)).toBe(false);
  });

  it("n'applique jamais deux fois le même achat, même appelé deux fois en même temps", async () => {
    const s = memory();
    savePending(s, { menuKey: "m1", date: "2026-11-14", list, pantrySavingsCents: 0 });
    let pantry: PantryItem[] = [];
    let applied = 0;
    const deps = {
      getPantry: async () => ({ items: pantry }),
      putPantry: async (items: PantryItem[]) => void (pantry = items),
      onApplied: () => void applied++,
    };
    const [first, second] = await Promise.all([applyPending(s, deps), applyPending(s, deps)]);
    expect(first?.menuKey).toBe("m1");
    expect(second).toBeNull(); // le second appelant n'a rien appliqué : pas de second message
    await applyPending(s, deps); // plus rien en attente
    expect(applied).toBe(1);
    expect(pantry.find((i) => i.ingredientId === "riz-long")?.quantity).toBe(1000);
  });

  it("reste en attente si l'envoi échoue encore", async () => {
    const s = memory();
    savePending(s, { menuKey: "m1", date: "2026-11-14", list, pantrySavingsCents: 0 });
    await expect(applyPending(s, { getPantry: async () => Promise.reject(new Error("hors ligne")), putPantry: async () => undefined })).rejects.toThrow();
    expect(readPending(s)).not.toBeNull();
  });

  it("ne fait rien sans achat en attente, et ignore un contenu illisible", async () => {
    const s = memory();
    expect(await applyPending(s, { getPantry: async () => ({ items: [] }), putPantry: async () => undefined })).toBeNull();
    s.setItem(PENDING_PURCHASE_KEY, "{pas du json");
    expect(readPending(s)).toBeNull();
  });
});
