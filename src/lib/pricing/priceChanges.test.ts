import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { pkg } from "@/lib/engine/test-fixtures";
import { resolvePriceBook } from "./priceBook";
import { priceChanges } from "./priceChanges";

const data = loadSeedData();
const ingredients = new Map(data.ingredients.map((i) => [i.id, i]));
const book = resolvePriceBook({ referencePackages: data.packages, store: { priceIndex: 100 } });

describe("alertes de prix entre deux imports", () => {
  it("signale les hausses et les baisses d'au moins 10 %, pas les petites variations", () => {
    const prev = [pkg("spaghetti", 500, 100), pkg("lait-demi-ecreme", 1000, 100), pkg("riz-long", 1000, 200)];
    const next = [pkg("spaghetti", 500, 130), pkg("lait-demi-ecreme", 1000, 105), pkg("riz-long", 1000, 150)];
    const changes = priceChanges(prev, next, ingredients, book);
    expect(changes.map((c) => [c.ingredientId, c.pct])).toEqual([
      ["spaghetti", 30],
      ["riz-long", -25],
    ]);
  });

  it("propose une alternative de la même famille, nettement moins chère", () => {
    const [c] = priceChanges([pkg("penne", 500, 80)], [pkg("penne", 500, 300)], ingredients, book);
    expect(c!.alternative).not.toBeNull();
    expect(ingredients.get(c!.alternative!.id)!.tags).toContain("base:pates");
  });

  it("ignore un ingrédient sans prix précédent", () => {
    expect(priceChanges([], [pkg("penne", 500, 300)], ingredients, book)).toEqual([]);
  });
});
