import ciqualMap from "../../../data/ciqual-map.json";
import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { energyShares, nutritionBonus } from "./nutrition";
import { optimizeMenu } from "./optimize";
import { filterRecipes } from "./recipes";
import { prefs, seedContext } from "./test-fixtures";

const data = loadSeedData();
const ctx = seedContext();

const ciqualMapped = new Set(Object.entries(ciqualMap.ingredients).filter(([, e]) => e.code !== null).map(([id]) => id));

describe("données nutritionnelles", () => {
  it("couvrent tous les ingrédients, avec des calories cohérentes avec les macros", () => {
    for (const i of data.ingredients) {
      expect(i.nutrition, i.id).toBeDefined();
      const n = i.nutrition!;
      if (i.id.startsWith("vin-") || n.kcal <= 20) continue; // alcool ; aliments très peu caloriques
      // Valeurs Ciqual (vérifiées par ciqual.test.ts) : leur énergie compte aussi les fibres (2 kcal/g),
      // absentes de nos 4 macros — très visible sur les épices et herbes séchées.
      if (ciqualMapped.has(i.id)) continue;
      const fromMacros = 4 * n.protein + 4 * n.carbs + 9 * n.fat;
      expect(Math.abs(fromMacros - n.kcal), i.id).toBeLessThanOrEqual(Math.max(25, n.kcal * 0.25));
    }
  });

  it("donne des valeurs plausibles par portion (carbonara)", () => {
    const c = filterRecipes(prefs({ persons: 2 }), ctx).candidates.find((x) => x.recipe.id === "spaghetti-carbonara")!;
    expect(c.nutrition!.kcal).toBeGreaterThan(500);
    expect(c.nutrition!.kcal).toBeLessThan(1000);
    expect(c.nutrition!.protein).toBeGreaterThan(20);
  });
});

describe("objectif nutritionnel", () => {
  it("favorise les portions riches en protéines et pénalise les pauvres", () => {
    expect(nutritionBonus({ kcal: 600, protein: 35, carbs: 50, fat: 20 }, "proteine")).toBeGreaterThan(nutritionBonus({ kcal: 600, protein: 10, carbs: 90, fat: 20 }, "proteine"));
    expect(nutritionBonus({ kcal: 600, protein: 10, carbs: 90, fat: 20 }, "aucun")).toBe(0);
  });

  it("favorise une répartition proche de 15 / 50 / 35 %", () => {
    const balanced = { kcal: 650, protein: 25, carbs: 80, fat: 25 };
    const fatty = { kcal: 900, protein: 20, carbs: 30, fat: 75 };
    expect(energyShares(balanced).carbs).toBeGreaterThan(0.45);
    expect(nutritionBonus(balanced, "equilibre")).toBeGreaterThan(nutritionBonus(fatty, "equilibre"));
  });

  it("« Riche en protéines » augmente l'apport moyen du menu, sans dépasser le budget", () => {
    let base = 0;
    let rich = 0;
    for (const seed of [1, 2, 3, 4]) {
      const p = { budgetCents: 4000, meals: 5, persons: 2, seed };
      const a = optimizeMenu(prefs(p), ctx);
      const b = optimizeMenu(prefs({ ...p, nutritionGoal: "proteine" }), ctx);
      expect(b.totalCents).toBeLessThanOrEqual(4000);
      base += a.nutritionPerMeal!.protein;
      rich += b.nutritionPerMeal!.protein;
    }
    expect(rich).toBeGreaterThan(base * 1.15);
  }, 20_000);
});
