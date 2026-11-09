import { describe, expect, it } from "vitest";
import { addSnapshot, isReliableTrend, monthlyFromHistory, summarizeTrend, type TrendPoint } from "./priceTrends";

describe("évolution des prix", () => {
  it("compare au prix d'il y a environ 6 mois", () => {
    const pts: TrendPoint[] = [
      ["2025-03", 200, 2],
      ["2025-05", 210, 1],
      ["2025-09", 220, 3],
      ["2025-11", 250, 1],
    ];
    const s = summarizeTrend(pts)!;
    expect(s.base[0]).toBe("2025-05");
    expect(s.pct).toBe(19);
    expect(s.last[1]).toBe(250);
  });

  it("prend le plus ancien point quand l'historique est court", () => {
    const s = summarizeTrend([["2025-10", 100, 1], ["2025-11", 90, 1]])!;
    expect(s.base[0]).toBe("2025-10");
    expect(s.pct).toBe(-10);
  });

  it("rien à dire avec un seul point", () => {
    expect(summarizeTrend([["2025-10", 100, 1]])).toBeNull();
  });
});

describe("votre historique de prix", () => {
  const line = (cost: number) => [{ ingredientId: "riz", unit: "g" as const, purchased: 1000, costCents: cost, staple: false }];
  it("garde un point par changement de prix, un seul par jour", () => {
    let h = addSnapshot({}, "s", "2026-01-05", line(145));
    h = addSnapshot(h, "s", "2026-01-12", line(145));
    h = addSnapshot(h, "s", "2026-02-02", line(159));
    h = addSnapshot(h, "s", "2026-02-02", line(162));
    expect(h.s!.riz).toEqual([["2026-01-05", 145], ["2026-02-02", 162]]);
    expect(monthlyFromHistory(h.s!.riz!)).toEqual([["2026-01", 145, 1], ["2026-02", 162, 1]]);
  });

  it("ne garde que les tendances du marché assez fournies", () => {
    expect(isReliableTrend([["2025-01", 1, 1], ["2025-02", 1, 1], ["2025-03", 1, 1]])).toBe(false);
    expect(isReliableTrend([["2025-01", 1, 2], ["2025-02", 1, 1], ["2025-03", 1, 2], ["2025-04", 1, 1]])).toBe(true);
  });
});
