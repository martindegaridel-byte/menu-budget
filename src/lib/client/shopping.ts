import { AISLES, type Aisle, type PantryItem } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { ShoppingLine, ShoppingList } from "@/lib/engine/types";
import { formatQuantity } from "@/lib/engine/units";

/** Lignes à acheter groupées par rayon (ordre du parcours en magasin). */
export function groupByAisle(lines: readonly ShoppingLine[]): { aisle: Aisle; label: string; lines: ShoppingLine[] }[] {
  const order = Object.keys(AISLES) as Aisle[];
  const groups = new Map<Aisle, ShoppingLine[]>();
  for (const l of lines) groups.set(l.aisle, [...(groups.get(l.aisle) ?? []), l]);
  return order.filter((a) => groups.has(a)).map((a) => ({ aisle: a, label: AISLES[a], lines: groups.get(a)! }));
}

export function describePicks(line: ShoppingLine): string {
  return line.picks.map((p) => `${p.count} × ${p.label}`).join(" + ");
}

/** Texte de la liste de courses pour copier / partager. */
export function shoppingListText(list: ShoppingList, meta: { meals: number; persons: number; storeName?: string }): string {
  const toBuy = list.lines.filter((l) => l.toBuy > 0);
  const out = [
    `🛒 Liste de courses — ${meta.meals} repas, ${meta.persons} pers.${meta.storeName ? ` — ${meta.storeName}` : ""}`,
    `Total estimé : ${formatEuros(list.totalCents)}`,
  ];
  for (const g of groupByAisle(toBuy)) {
    out.push("", g.label.toUpperCase());
    for (const l of g.lines) out.push(`☐ ${l.name} — ${describePicks(l)} (${formatEuros(l.costCents)})`);
  }
  const home = list.lines.filter((l) => l.toBuy === 0);
  if (home.length) out.push("", `Déjà au placard : ${home.map((l) => l.name).join(", ")}`);
  return out.join("\n");
}

/**
 * Placard après les courses et la cuisine du menu : on retire ce que le menu
 * consomme depuis le placard et on ajoute les restes des paquets achetés.
 */
export function pantryAfterShopping(pantry: readonly PantryItem[], list: ShoppingList): PantryItem[] {
  const byId = new Map(pantry.map((p) => [p.ingredientId, { ...p }]));
  for (const l of list.lines) {
    const cur = byId.get(l.ingredientId);
    if (cur && cur.quantity === null) continue; // « en quantité suffisante »
    const qty = (cur?.quantity ?? 0) - l.fromPantry + l.leftover;
    const rounded = Math.round(qty * 10) / 10;
    if (rounded <= 0) byId.delete(l.ingredientId);
    else byId.set(l.ingredientId, { ingredientId: l.ingredientId, quantity: rounded, expiresOn: cur?.expiresOn });
  }
  return [...byId.values()];
}

export function lineQuantityText(l: ShoppingLine): string {
  return formatQuantity(l.needed, l.unit);
}
