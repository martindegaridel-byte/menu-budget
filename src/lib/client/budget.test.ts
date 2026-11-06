import { describe, expect, it } from "vitest";
import { monthBudgetStatus, monthlySpending } from "./budget";

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
