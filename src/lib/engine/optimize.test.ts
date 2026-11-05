import { describe, expect, it } from "vitest";
import { ALLERGENS, DIETS, type Allergen, type Diet } from "@/lib/domain/schemas";
import { evaluateMenu, optimizeMenu, swapOptions, varietyCap } from "./optimize";
import { filterRecipes, historyPenalty } from "./recipes";
import { createRng } from "./rng";
import { prefs, seedContext } from "./test-fixtures";

const ctx = seedContext();

describe("optimizeMenu", () => {
  it("respecte le budget et le nombre de repas", () => {
    const res = optimizeMenu(prefs({ budgetCents: 2500, meals: 5, persons: 2 }), ctx);
    expect(res.status).toBe("ok");
    expect(res.recipes).toHaveLength(5);
    expect(res.totalCents).toBeLessThanOrEqual(2500);
    expect(res.totalCents).toBe(res.shoppingList.totalCents);
  });

  it("attribue un coût à chaque plat dont la somme est exactement le total", () => {
    const res = optimizeMenu(prefs({ budgetCents: 4000, meals: 7, persons: 3 }), ctx);
    expect(res.recipes.reduce((a, r) => a + r.allocatedCents, 0)).toBe(res.totalCents);
  });

  it("évite les doublons quand assez de recettes sont disponibles", () => {
    const res = optimizeMenu(prefs({ budgetCents: 5000, meals: 7 }), ctx);
    expect(new Set(res.recipes.map((r) => r.recipeId)).size).toBe(7);
  });

  it("explique un budget impossible (montant manquant + alternatives)", () => {
    const res = optimizeMenu(prefs({ budgetCents: 1500, meals: 7, persons: 4 }), ctx);
    expect(res.status).toBe("over-budget");
    expect(res.recipes).toHaveLength(7);
    const msg = res.diagnostics.find((d) => d.code === "over-budget")!.message;
    expect(msg).toMatch(/Il manque \d+,\d{2} € pour 4 personnes et 7 repas/);
    expect(res.totalCents - 1500).toBeGreaterThan(0);
    expect(res.diagnostics.some((d) => d.code === "suggest-meals")).toBe(true);
  });

  it("explique quand aucune recette ne passe les contraintes", () => {
    const res = optimizeMenu(prefs({ diet: "vegan", maxTotalMinutes: 5 }), ctx);
    expect(res.status).toBe("no-candidates");
    expect(res.diagnostics[0]!.message).toMatch(/temps de préparation/);
  });

  it("utilise le placard pour passer sous le budget", () => {
    const p = prefs({ budgetCents: 600, meals: 2, persons: 2, diet: "vegan" });
    const without = optimizeMenu(p, ctx);
    const pantry = [
      { ingredientId: "riz-long", quantity: 2000 },
      { ingredientId: "riz-basmati", quantity: 2000 },
      { ingredientId: "tomates-concassees", quantity: 2400 },
      { ingredientId: "oignon-jaune", quantity: 1000 },
      { ingredientId: "ail", quantity: 150 },
      { ingredientId: "pois-chiches", quantity: 1000 },
      { ingredientId: "haricots-rouges", quantity: 1000 },
      { ingredientId: "lentilles-corail", quantity: 500 },
      ...["sel", "cumin", "curry-poudre", "paprika", "curcuma", "huile-tournesol", "huile-olive"].map((id) => ({
        ingredientId: id,
        quantity: null,
      })),
    ];
    const withPantry = optimizeMenu(p, seedContext({ pantry }));
    expect(withPantry.totalCents).toBeLessThan(without.totalCents);
    expect(withPantry.totalCents).toBeLessThanOrEqual(600);
    expect(withPantry.pantrySavingsCents).toBeGreaterThan(0);
  });

  it("ajoute les ingrédients facultatifs seulement si le budget le permet", () => {
    const tight = optimizeMenu(prefs({ budgetCents: 2500, meals: 5, persons: 2 }), ctx);
    const loose = optimizeMenu(prefs({ budgetCents: 2500 * 3, meals: 5, persons: 2 }), ctx);
    expect(tight.totalCents).toBeLessThanOrEqual(2500);
    expect(loose.recipes.flatMap((r) => r.skippedOptional)).toHaveLength(0);
  });

  it("budget nul : possible uniquement si le placard couvre tout", () => {
    expect(optimizeMenu(prefs({ budgetCents: 0, meals: 1 }), ctx).status).toBe("over-budget");
  });

  it("est déterministe pour une même graine", () => {
    const a = optimizeMenu(prefs({ seed: 7 }), ctx).recipes.map((r) => r.recipeId);
    const b = optimizeMenu(prefs({ seed: 7 }), ctx).recipes.map((r) => r.recipeId);
    expect(a).toEqual(b);
  });

  it("privilégie les cuisines aimées", () => {
    const res = optimizeMenu(prefs({ budgetCents: 4000, meals: 4, likedCuisines: ["indienne"] }), ctx);
    expect(res.recipes.filter((r) => r.cuisine === "indienne").length).toBeGreaterThanOrEqual(2);
  });
});

describe("variété", () => {
  // Profil type : 1 personne, 20 €, 5 dîners, 45 min, condiments cochés au placard.
  const staples = [...ctx.ingredients.values()].filter((i) => i.staple).map((i) => ({ ingredientId: i.id, quantity: null }));
  const withStaples = seedContext({ pantry: staples });
  const profile = (seed: number, recentRecipeIds: string[] = []) =>
    prefs({ budgetCents: 2000, meals: 5, persons: 1, maxTotalMinutes: 45, seed, recentRecipeIds });
  const candidates = new Map(filterRecipes(profile(0), withStaples).candidates.map((c) => [c.recipe.id, c]));

  it("propose au moins 25 recettes différentes sur 20 générations, sans dépasser le budget", () => {
    const seen = new Set<string>();
    let recent: string[] = [];
    for (let k = 0; k < 20; k++) {
      const res = optimizeMenu(profile(1000 + k * 7919, recent), withStaples);
      expect(res.status).toBe("ok");
      expect(res.totalCents).toBeLessThanOrEqual(2000);
      const ids = res.recipes.map((r) => r.recipeId);
      recent = [...ids, ...recent.filter((id) => !ids.includes(id))].slice(0, 15);
      ids.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBeGreaterThanOrEqual(25);
  }, 30_000);

  it("ne met jamais plus de 2 plats sur la même base dans un menu de 5", () => {
    expect(varietyCap(5)).toBe(2);
    for (let k = 0; k < 10; k++) {
      const res = optimizeMenu(profile(500 + k * 131), withStaples);
      const bases = new Map<string, number>();
      for (const r of res.recipes) {
        const b = candidates.get(r.recipeId)?.base;
        if (b) bases.set(b, (bases.get(b) ?? 0) + 1);
      }
      for (const n of bases.values()) expect(n).toBeLessThanOrEqual(2);
    }
  }, 30_000);

  it("évite les plats du dernier menu", () => {
    const first = optimizeMenu(profile(11), withStaples).recipes.map((r) => r.recipeId);
    const next = optimizeMenu(profile(11, first), withStaples).recipes.map((r) => r.recipeId);
    expect(next.filter((id) => first.includes(id)).length).toBeLessThanOrEqual(1);
  });

  it("pénalise d'abord le dernier menu, puis de moins en moins", () => {
    const recent = ["a", "b", "c", "d", "e", "f"];
    expect(historyPenalty("a", recent, 2)).toBeGreaterThan(historyPenalty("c", recent, 2));
    expect(historyPenalty("c", recent, 2)).toBeGreaterThan(historyPenalty("e", recent, 2));
    expect(historyPenalty("z", recent, 2)).toBe(0);
  });

  it("varie d'une graine à l'autre et garde la graine dans le résultat", () => {
    const menus = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const res = optimizeMenu(profile(seed), withStaples);
      expect(res.seed).toBe(seed);
      menus.add(res.recipes.map((r) => r.recipeId).sort().join(","));
    }
    expect(menus.size).toBeGreaterThanOrEqual(3);
  });
});

describe("swap et ajustement en direct", () => {
  const p = prefs({ budgetCents: 3000, meals: 4, persons: 2 });
  const menu = optimizeMenu(p, ctx);
  const ids = menu.recipes.map((r) => r.recipeId);

  it("propose des remplaçants avec le nouveau total recalculé", () => {
    const opts = swapOptions(ids, 0, p, ctx);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(ids).not.toContain(o.recipeId);
    const first = opts[0]!;
    const swapped = evaluateMenu([first.recipeId, ...ids.slice(1)], p, ctx);
    expect(swapped.totalCents).toBe(first.newTotalCents);
    expect(first.fitsBudget).toBe(first.newTotalCents <= 3000);
  });

  it("recalcule tout quand le nombre de personnes change", () => {
    const more = evaluateMenu(ids, { ...p, persons: 6 }, ctx);
    expect(more.recipes.map((r) => r.recipeId)).toEqual(ids);
    expect(more.totalCents).toBeGreaterThan(menu.totalCents);
    if (more.totalCents > 3000) expect(more.status).toBe("over-budget");
  });
});

describe("critère d'acceptation : 100 combinaisons budget × personnes × régime", () => {
  const diets = Object.keys(DIETS) as Diet[];
  const allergens = Object.keys(ALLERGENS) as Allergen[];
  const rng = createRng(42);
  const cases = Array.from({ length: 100 }, (_, i) => {
    const persons = 1 + Math.floor(rng() * 6);
    const meals = 1 + Math.floor(rng() * 10);
    const budgetCents = Math.floor(rng() * 1500 * meals) + 100;
    const diet = diets[i % diets.length]!;
    const excluded = allergens.filter(() => rng() < 0.12);
    const excludedIngredientIds = ["champignon-paris", "poivron", "lardons-fumes", "tomate"].filter(() => rng() < 0.25);
    return prefs({ persons, meals, budgetCents, diet, allergens: excluded, excludedIngredientIds, seed: i });
  });

  it.each(cases.map((c, i) => [i, c] as const))("cas %i", (_, p) => {
    const t0 = Date.now();
    const res = optimizeMenu(p, ctx);
    expect(Date.now() - t0).toBeLessThan(2000);

    if (res.status === "ok") expect(res.totalCents).toBeLessThanOrEqual(p.budgetCents);
    else expect(res.diagnostics.some((d) => d.level === "error")).toBe(true);

    // Aucun aliment exclu, quel que soit le statut (le menu « le moins cher » aussi).
    const candidates = new Map(filterRecipes(p, ctx).candidates.map((c) => [c.recipe.id, c]));
    for (const r of res.recipes) {
      const c = candidates.get(r.recipeId)!;
      expect(c).toBeDefined();
      for (const id of c.needs.keys()) {
        const ing = ctx.ingredients.get(id)!;
        expect(p.excludedIngredientIds).not.toContain(id);
        for (const a of ing.allergens) expect(p.allergens).not.toContain(a);
      }
    }
    for (const line of res.shoppingList.lines) {
      const ing = ctx.ingredients.get(line.ingredientId)!;
      expect(p.excludedIngredientIds).not.toContain(ing.id);
      for (const a of ing.allergens) expect(p.allergens).not.toContain(a);
      if (p.diet === "vegan") expect(ing.animal).toBeNull();
      if (p.diet === "vegetarien") expect(["viande", "poisson", "fruits-de-mer"]).not.toContain(ing.animal);
    }
  });
});

describe("performance", () => {
  it("génère une semaine complète (14 repas, 4 pers.) en moins de 2 s", () => {
    const t0 = Date.now();
    optimizeMenu(prefs({ budgetCents: 12000, meals: 14, persons: 4 }), ctx);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
