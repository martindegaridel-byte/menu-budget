/** Montant en centimes d'euro (entier). */
export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isInteger(value)) throw new Error(`Montant non entier : ${value}`);
  return value;
}

const formatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Formate des centimes en euros, ex. 230 → « 2,30 € ». */
export function formatEuros(cents: Cents): string {
  return formatter.format(cents / 100).replace(/ | /g, " ");
}

/** Convertit une saisie en euros (ex. 12.5 ou "12,50") en centimes, arrondi au centime. */
export function eurosToCents(euros: number | string): Cents {
  const n = typeof euros === "string" ? Number(euros.replace(",", ".").trim()) : euros;
  if (!Number.isFinite(n)) throw new Error(`Montant invalide : ${euros}`);
  return Math.round(n * 100);
}

/** Divise un montant en arrondissant au centime supérieur (coût par personne affiché). */
export function divideCeil(cents: Cents, by: number): Cents {
  if (by <= 0) throw new Error("Division par zéro");
  return Math.ceil(cents / by);
}

/**
 * Répartit un total entier selon des poids (méthode du plus fort reste) :
 * la somme des parts vaut exactement `total`.
 */
export function allocateCents(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const w = sum > 0 ? weights.map((x) => Math.max(0, x) / sum) : weights.map(() => 1 / weights.length);
  const raw = w.map((x) => x * total);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k]!.i]! += 1;
  return parts;
}
