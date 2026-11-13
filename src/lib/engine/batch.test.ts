import { describe, expect, it } from "vitest";
import { optimizeMenu } from "./optimize";
import { coverFor, filterRecipes, keepDaysFor, MAX_COVER, sessionMinutesFor } from "./recipes";
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

describe("semaine en batch cooking : une session pour tout", () => {
  it("estime la durée de session : préparations à la suite, cuissons en parallèle (3 au plus)", () => {
    expect(sessionMinutesFor([{ prepMinutes: 15, cookMinutes: 40 }, { prepMinutes: 10, cookMinutes: 20 }])).toBe(25 + 40);
    expect(sessionMinutesFor(Array.from({ length: 6 }, () => ({ prepMinutes: 10, cookMinutes: 30 })))).toBe(60 + 60);
  });

  it("calcule jusqu'à quel jour un plat peut être servi", () => {
    expect(keepDaysFor({ fridgeDays: 3, freezable: true, reheats: true })).toBeGreaterThan(30); // congélateur
    expect(keepDaysFor({ fridgeDays: 3, freezable: false, reheats: true })).toBe(3);
    expect(keepDaysFor({ fridgeDays: 2, freezable: false, reheats: false })).toBe(1);
    expect(keepDaysFor({})).toBe(1);
  });

  it.each([
    [7, 1, 3500, 180],
    [7, 2, 5500, 150],
    [5, 1, 2500, 120],
  ])("%i soirs, %i pers. : session ≤ limite, chaque plat tient jusqu'à son soir, budget respecté", (meals, persons, budgetCents, limit) => {
    for (const seed of [1, 2]) {
      const p = prefs({ budgetCents, meals, persons, maxTotalMinutes: 90, seed, batchCooking: true, batchSessionMinutes: limit });
      const res = optimizeMenu(p, ctx);
      expect(res.status).toBe("ok");
      expect(res.totalCents).toBeLessThanOrEqual(budgetCents);
      expect(res.prepPlan!.sessionMinutes).toBeLessThanOrEqual(limit);
      expect(res.prepPlan!.freshSlots).toEqual([]);
      res.recipes.forEach((r, day) => {
        const keep = keepDaysFor(byId.get(r.recipeId)!);
        expect(keep, `${r.recipeId} servi au jour ${day}`).toBeGreaterThanOrEqual(day);
      });
    }
  }, 30_000);

  it("partage plus d'ingrédients qu'un menu classique", () => {
    const shared = (ids: string[]) => {
      const p = prefs({ persons: 1, maxTotalMinutes: 90 });
      const needs = new Map(filterRecipes(p, ctx).candidates.map((c) => [c.recipe.id, [...c.needs.keys()].filter((id) => !ctx.ingredients.get(id)?.staple)]));
      const uses = new Map<string, number>();
      for (const id of new Set(ids)) for (const ing of needs.get(id) ?? []) uses.set(ing, (uses.get(ing) ?? 0) + 1);
      // Rapporté au nombre de plats distincts : en batch, un plat couvre plusieurs soirs.
      return [...uses.values()].filter((n) => n > 1).length / Math.max(1, new Set(ids).size);
    };
    let batch = 0;
    let normal = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const base = { budgetCents: 3500, meals: 7, persons: 1, maxTotalMinutes: 90, seed };
      batch += shared(optimizeMenu(prefs({ ...base, batchCooking: true }), ctx).recipes.map((r) => r.recipeId));
      normal += shared(optimizeMenu(prefs(base), ctx).recipes.map((r) => r.recipeId));
    }
    expect(batch).toBeGreaterThanOrEqual(normal);
  }, 60_000);
});
