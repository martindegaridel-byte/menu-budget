import { describe, expect, it } from "vitest";
import { pkg } from "@/lib/engine/test-fixtures";
import { resolvePriceBook, scaleToObserved } from "./priceBook";

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

describe("scaleToObserved", () => {
  const ref = (ingredientId: string, quantity: number, priceCents: number) =>
    ({ id: `${ingredientId}:${quantity}`, ingredientId, label: `${quantity}`, quantity, priceCents, source: "estimate", asOf: "2026-11-01" }) as const;
  const obs = (ingredientId: string, quantity: number, priceCents: number) => ({ ...ref(ingredientId, quantity, priceCents), source: "openprices" as const, asOf: "2026-10-01" });

  it("garde les formats habituels au niveau de prix relevé", () => {
    const out = scaleToObserved([ref("poivre", 50, 169)], [obs("poivre", 250, 978)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(50);
    expect(out[0]!.priceCents).toBe(Math.round(169 * Math.min(1.6, 978 / 250 / (169 / 50))));
    expect(out[0]!.source).toBe("openprices");
  });

  it("borne l'ajustement et ignore les ingrédients sans relevé", () => {
    const out = scaleToObserved([ref("a", 100, 100), ref("b", 100, 100)], [obs("a", 100, 1000)]);
    expect(out.map((p) => p.ingredientId)).toEqual(["a"]);
    expect(out[0]!.priceCents).toBe(160);
  });
});
