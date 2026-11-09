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

/** Arrondi au dixième ; null si plus rien. */
function keep(q: number): number | null {
  const r = Math.round(q * 10) / 10;
  return r > 0 ? r : null;
}

/**
 * Durée de conservation indicative (jours) des produits frais, par rayon, une fois achetés.
 * Sert à repérer les restes à finir en priorité ; l'utilisateur peut corriger la date dans le placard.
 */
export const SHELF_LIFE_DAYS: Partial<Record<Aisle, number>> = {
  "fruits-legumes": 7,
  cremerie: 10,
  boucherie: 3,
  poissonnerie: 2,
  charcuterie: 5,
  boulangerie: 3,
  vegetal: 10,
};
/** Exceptions : se gardent plus longtemps que leur rayon. */
const SHELF_LIFE_OVERRIDES: Record<string, number> = { oeuf: 21, "pomme-de-terre": 30, oignon: 30, "oignon-jaune": 30, "oignon-rouge": 30, ail: 30, carotte: 14, pomme: 21 };

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Placard après les courses : on ajoute ce qui a été acheté (paquets entiers).
 * Avec `today`, les produits frais reçoivent une date limite estimée (si aucune n'est déjà notée),
 * pour que les prochains menus finissent les restes avant qu'ils ne se perdent.
 * La consommation est retirée ensuite, plat par plat (voir `pantryAfterCooking`).
 */
export function pantryAfterPurchase(pantry: readonly PantryItem[], list: ShoppingList, today?: string): PantryItem[] {
  const byId = new Map(pantry.map((p) => [p.ingredientId, { ...p }]));
  for (const l of list.lines) {
    if (l.purchased <= 0) continue;
    const cur = byId.get(l.ingredientId);
    if (cur && cur.quantity === null) continue; // « en quantité suffisante »
    const q = keep((cur?.quantity ?? 0) + l.purchased);
    if (q === null) continue;
    const life = SHELF_LIFE_OVERRIDES[l.ingredientId] ?? SHELF_LIFE_DAYS[l.aisle];
    const expiresOn = cur?.expiresOn ?? (today && life ? addDays(today, life) : undefined);
    byId.set(l.ingredientId, { ingredientId: l.ingredientId, quantity: q, ...(expiresOn ? { expiresOn } : {}) });
  }
  return [...byId.values()];
}

/**
 * Placard après avoir cuisiné un plat : on retire ce qu'il a utilisé.
 * Les articles « en quantité suffisante » (condiments) ne bougent pas.
 */
export function pantryAfterCooking(pantry: readonly PantryItem[], used: readonly { ingredientId: string; quantity: number }[]): PantryItem[] {
  const byId = new Map(pantry.map((p) => [p.ingredientId, { ...p }]));
  for (const u of used) {
    const cur = byId.get(u.ingredientId);
    if (!cur || cur.quantity === null) continue;
    const q = keep(cur.quantity - u.quantity);
    if (q === null) byId.delete(u.ingredientId);
    else byId.set(u.ingredientId, { ...cur, quantity: q });
  }
  return [...byId.values()];
}

export function lineQuantityText(l: ShoppingLine): string {
  return formatQuantity(l.needed, l.unit);
}
