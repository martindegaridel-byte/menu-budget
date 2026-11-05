import { describe, expect, it } from "vitest";
import { optimizeMenu } from "./optimize";
import { coverFor, filterRecipes, MAX_COVER } from "./recipes";
import { prefs, seedContext } from "./test-fixtures";

const ctx = seedContext();
const byId = new Map(ctx.recipes.map((r) => [r.id, r]));

describe("couverture de plusieurs soirs", () => {
  it("une recette sans champs de conservation reste à 1 soir", () => {
    expect(coverFor({}, 1)).toBe(1);
  });
  it("un plat qui ne se réchauffe pas ne couvre qu'un soir", () => {
    expect(coverFor({ portions: 4, fridgeDays: 3, reheats: false }, 1)).toBe(1);
  });
  it("respecte la durée de conservation, les portions et le plafond", () => {
    expect(coverFor({ portions: 4, fridgeDays: 1, reheats: true }, 1)).toBe(2); // jour J + 1 jour
    expect(coverFor({ portions: 4, fridgeDays: 3, reheats: true }, 2)).toBe(2); // 4 portions pour 2 personnes
    expect(coverFor({ portions: 12, fridgeDays: 6, reheats: true }, 1)).toBe(MAX_COVER);
    expect(MAX_COVER).toBe(3);
  });
});

describe("batch cooking dans le moteur", () => {
  const base = { budgetCents: 3500, meals: 5, persons: 1, maxTotalMinutes: 60 };

  it.each([1, 2, 3, 4, 5, 6])("graine %i : soirs consécutifs, conservation et budget respectés", (seed) => {
    const p = prefs({ ...base, seed, batchCooking: true });
    const res = optimizeMenu(p, ctx);
    expect(res.status).toBe("ok");
    expect(res.totalCents).toBeLessThanOrEqual(p.budgetCents);
    const cover = new Map(filterRecipes(p, ctx).candidates.map((c) => [c.recipe.id, c.maxCover]));
    const ids = res.recipes.map((r) => r.recipeId);
    for (const id of new Set(ids)) {
      const slots = ids.flatMap((x, k) => (x === id ? [k] : []));
      expect(slots.length, id).toBeLessThanOrEqual(cover.get(id)!);
      if (slots.length > 1) {
        expect(slots.at(-1)! - slots[0]!, `${id} : soirs consécutifs`).toBe(slots.length - 1);
        expect(byId.get(id)!.reheats, `${id} se réchauffe`).toBe(true);
        expect(slots.length - 1, `${id} : conservation`).toBeLessThanOrEqual(byId.get(id)!.fridgeDays!);
      }
    }
    expect(res.prepPlan).not.toBeNull();
  });

  it("cuisine moins souvent qu'un menu classique, avec le même coût par portion pour un plat répété", () => {
    let batchDistinct = 0;
    let normalDistinct = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const b = optimizeMenu(prefs({ ...base, seed, batchCooking: true }), ctx);
      const n = optimizeMenu(prefs({ ...base, seed }), ctx);
      batchDistinct += new Set(b.recipes.map((r) => r.recipeId)).size;
      normalDistinct += new Set(n.recipes.map((r) => r.recipeId)).size;
      expect(new Set(n.recipes.map((r) => r.recipeId)).size).toBe(5); // sans batch : jamais de répétition
      for (const g of b.prepPlan!.cookOnce) {
        const costs = g.slots.map((k) => b.recipes[k]!.allocatedCents);
        expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(1);
      }
    }
    expect(batchDistinct).toBeLessThan(normalDistinct);
  }, 30_000);
});
