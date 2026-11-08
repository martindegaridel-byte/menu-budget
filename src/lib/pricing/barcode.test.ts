import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { isBarcode, matchBarcodeProduct, type BarcodeProduct } from "./barcode";

const ingredients = new Map(loadSeedData().ingredients.map((i) => [i.id, i]));
const product = (p: Partial<BarcodeProduct>): BarcodeProduct => ({
  code: "3000000000000",
  product_name: null,
  brands: null,
  quantity: null,
  product_quantity: null,
  product_quantity_unit: null,
  categories_tags: [],
  ...p,
});

describe("produit scanné au code-barres", () => {
  it("reconnaît l'ingrédient et lit la contenance", () => {
    const m = matchBarcodeProduct(product({ product_name: "Penne rigate", brands: "Barilla, Barilla", product_quantity: 500, product_quantity_unit: "g", quantity: "500 g" }), ingredients);
    expect(m.ingredientId).toBe("penne");
    expect(m.quantity).toBe(500);
    expect(m.brand).toBe("Barilla");
    expect(m.quantityLabel).toBe("500 g");
  });

  it("compte les pièces (œufs) et laisse les condiments « en quantité suffisante »", () => {
    expect(matchBarcodeProduct(product({ product_name: "Oeufs frais de poules élevées en plein air x12", quantity: "12 œufs" }), ingredients)).toMatchObject({ ingredientId: "oeuf", quantity: 12 });
    expect(matchBarcodeProduct(product({ product_name: "Huile de tournesol", product_quantity: 1, product_quantity_unit: "l" }), ingredients)).toMatchObject({ ingredientId: "huile-tournesol", quantity: null });
  });

  it("ne devine pas un produit sans rapport", () => {
    expect(matchBarcodeProduct(product({ product_name: "Lessive liquide" }), ingredients).ingredientId).toBeNull();
    expect(isBarcode("3017620422003")).toBe(true);
    expect(isBarcode("12ab")).toBe(false);
  });
});

describe("plats préparés", () => {
  it("n'assimile pas un plat tout prêt à son accompagnement", () => {
    expect(matchBarcodeProduct(product({ product_name: "Poulet Satay et son Riz", product_quantity: 300, product_quantity_unit: "g" }), ingredients).ingredientId).toBeNull();
  });
});
