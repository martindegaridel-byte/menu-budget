/** Suivi des dépenses : coût réel (ticket) quand il est connu, sinon coût prévu. */

export interface SpendingMenu {
  createdAt: string;
  totalCents: number;
  actualCents: number | null;
}

export const MONTHLY_BUDGET_KEY = "mb:monthly-budget";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Dépense retenue pour un menu : le montant payé s'il est saisi, sinon le coût prévu. */
export const spentOf = (m: SpendingMenu) => m.actualCents ?? m.totalCents;

/** Prévu et réel sur les `count` derniers mois (le plus ancien d'abord). */
export function monthlySpending(menus: readonly SpendingMenu[], now = new Date(), count = 6) {
  const months = Array.from({ length: count }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - k), 1);
    return { key: monthKey(d), date: d, plannedCents: 0, actualCents: 0, withActual: 0, menus: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const menu of menus) {
    const m = byKey.get(monthKey(new Date(menu.createdAt)));
    if (!m) continue;
    m.menus++;
    m.plannedCents += menu.totalCents;
    if (menu.actualCents !== null) {
      m.actualCents += menu.actualCents;
      m.withActual++;
    }
  }
  return months;
}

/**
 * Budget du mois : dépensé (menus enregistrés ce mois-ci), restant, et une suggestion
 * pour la semaine en cours (restant ÷ semaines restantes, semaine en cours comprise).
 */
export function monthBudgetStatus(monthlyCents: number, menus: readonly SpendingMenu[], now = new Date()) {
  const key = monthKey(now);
  const spentCents = menus.filter((m) => monthKey(new Date(m.createdAt)) === key).reduce((a, m) => a + spentOf(m), 0);
  const remainingCents = Math.max(0, monthlyCents - spentCents);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  return {
    spentCents,
    remainingCents,
    overCents: Math.max(0, spentCents - monthlyCents),
    weeksLeft,
    weeklyCents: Math.floor(remainingCents / weeksLeft),
    ratio: monthlyCents > 0 ? spentCents / monthlyCents : 0,
  };
}

/** Repère de comparaison : un plat livré ou à emporter, par portion (indicatif). */
export const TAKEAWAY_PORTION_CENTS = 1200;

export interface SavingsMenu extends SpendingMenu {
  budgetCents: number;
  portions: number;
  pantrySavingsCents: number;
}

/** Bilan : dépenses, coût moyen par portion, économies sous le budget, grâce au placard et face à un plat livré. */
export function savingsSummary(menus: readonly SavingsMenu[]) {
  let spentCents = 0;
  let portions = 0;
  let underBudgetCents = 0;
  let pantryCents = 0;
  for (const m of menus) {
    const spent = spentOf(m);
    spentCents += spent;
    portions += m.portions;
    underBudgetCents += Math.max(0, m.budgetCents - spent);
    pantryCents += m.pantrySavingsCents;
  }
  const perPortionCents = portions ? Math.round(spentCents / portions) : 0;
  const vsTakeawayCents = Math.max(0, TAKEAWAY_PORTION_CENTS * portions - spentCents);
  return { menus: menus.length, portions, spentCents, perPortionCents, underBudgetCents, pantryCents, vsTakeawayCents };
}
