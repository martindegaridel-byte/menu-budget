import { describe, expect, it } from "vitest";
import { pkg } from "@/lib/engine/test-fixtures";
import { resolvePriceBook } from "./priceBook";

const reference = [pkg("riz", 1000, 145), pkg("riz", 500, 89), pkg("pates", 500, 79)];

describe("resolvePriceBook (multi-magasins)", () => {
  it("applique l'indice de prix du magasin aux estimations (arrondi supérieur)", () => {
    const book = resolvePriceBook({ referencePackages: reference, store: { priceIndex: 110 } });
    expect(book.get("pates")![0]!.priceCents).toBe(87); // 79 × 1,10 = 86,9 → 87
  });

  it("le prix saisi par l'utilisateur remplace l'estimation de même contenance", () => {
    const book = resolvePriceBook({
      referencePackages: reference,
      store: { priceIndex: 110 },
      storePackages: [pkg("riz", 1000, 120)],
    });
    const riz = book.get("riz")!;
    expect(riz.map((p) => p.priceCents).sort()).toEqual([120, 98]);
  });

  it("retire les ingrédients signalés indisponibles", () => {
    const book = resolvePriceBook({ referencePackages: reference, store: { priceIndex: 100 }, unavailableIngredientIds: ["riz"] });
    expect(book.has("riz")).toBe(false);
  });
});
