import { describe, expect, it } from "vitest";
import { monthBudgetStatus, monthlySpending, savingsSummary, TAKEAWAY_PORTION_CENTS } from "./budget";

const now = new Date(2026, 10, 15); // 15 novembre 2026
const menus = [
  { createdAt: new Date(2026, 10, 2).toISOString(), totalCents: 2000, actualCents: 2350 },
  { createdAt: new Date(2026, 10, 9).toISOString(), totalCents: 1800, actualCents: null },
  { createdAt: new Date(2026, 9, 20).toISOString(), totalCents: 2500, actualCents: 2400 },
  { createdAt: new Date(2025, 0, 1).toISOString(), totalCents: 9999, actualCents: null }, // trop ancien
];

describe("suivi des dépenses", () => {
  it("cumule prévu et réel par mois, sur les 6 derniers mois", () => {
    const m = monthlySpending(menus, now);
    expect(m).toHaveLength(6);
    expect(m.at(-1)).toMatchObject({ plannedCents: 3800, actualCents: 2350, withActual: 1, menus: 2 });
    expect(m.at(-2)).toMatchObject({ plannedCents: 2500, actualCents: 2400 });
    expect(m.reduce((a, x) => a + x.menus, 0)).toBe(3);
  });

  it("calcule le budget du mois : réel s'il est saisi, sinon prévu", () => {
    const s = monthBudgetStatus(12000, menus, now);
    expect(s.spentCents).toBe(2350 + 1800);
    expect(s.remainingCents).toBe(12000 - 4150);
    expect(s.weeksLeft).toBe(3); // 16 jours restants, 15 compris
    expect(s.weeklyCents).toBe(Math.floor(7850 / 3));
  });

  it("signale un dépassement", () => {
    const s = monthBudgetStatus(3000, menus, now);
    expect(s.remainingCents).toBe(0);
    expect(s.overCents).toBe(1150);
  });
});

describe("bilan des économies", () => {
  it("additionne placard, marge sous le budget et compare à un plat livré", () => {
    const s = savingsSummary([
      { createdAt: "2026-10-01", totalCents: 2000, actualCents: 1800, budgetCents: 2500, portions: 10, pantrySavingsCents: 300 },
      { createdAt: "2026-10-08", totalCents: 3100, actualCents: null, budgetCents: 3000, portions: 10, pantrySavingsCents: 0 },
    ]);
    expect(s).toEqual({
      menus: 2,
      portions: 20,
      spentCents: 4900,
      perPortionCents: 245,
      underBudgetCents: 700,
      pantryCents: 300,
      vsTakeawayCents: 20 * TAKEAWAY_PORTION_CENTS - 4900,
    });
  });

  it("aucun menu : tout à zéro", () => {
    expect(savingsSummary([]).perPortionCents).toBe(0);
  });
});
