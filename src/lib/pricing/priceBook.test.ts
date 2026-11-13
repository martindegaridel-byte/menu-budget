import { describe, expect, it } from "vitest";
import { pkg } from "@/lib/engine/test-fixtures";
import { indexUnobserved, resolvePriceBook, scaleToObserved } from "./priceBook";

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

describe("indexUnobserved (pas d'impasse sans relevé)", () => {
  const mk = (ingredientId: string, quantity: number, priceCents: number, source: "estimate" | "openprices" = "estimate") =>
    ({ id: `${ingredientId}:${quantity}`, ingredientId, label: `${quantity}`, quantity, priceCents, source, asOf: "2026-10-01" }) as const;
  const aisles: Record<string, string> = { a1: "cremerie", a2: "cremerie", a3: "cremerie", a4: "cremerie", b1: "boucherie", b2: "boucherie", c1: "conserves" };
  const aisleOf = (id: string) => aisles[id];
  const reference = Object.keys(aisles).map((id) => mk(id, 100, 100));
  // Relevés : +20 % sur 3 ingrédients de la crèmerie, −10 % sur 1, rien ailleurs
  const observed = [mk("a1", 100, 120, "openprices"), mk("a2", 100, 120, "openprices"), mk("a3", 100, 120, "openprices"), mk("b1", 100, 90, "openprices")];

  it("recale un ingrédient sans relevé sur le niveau constaté dans son rayon", () => {
    const out = indexUnobserved(reference, observed, aisleOf);
    const a4 = out.find((p) => p.ingredientId === "a4")!;
    expect(a4.priceCents).toBe(120);
    expect(a4.source).toBe("estimate");
  });

  it("n'utilise le niveau du rayon qu'avec assez d'ingrédients observés, sinon celui du magasin", () => {
    const out = indexUnobserved(reference, observed, aisleOf);
    // boucherie : un seul observé (< 3) → médiane de tout le magasin (1,2 ; 1,2 ; 1,2 ; 0,9 → 1,2)
    expect(out.find((p) => p.ingredientId === "b2")!.priceCents).toBe(120);
    expect(out.find((p) => p.ingredientId === "c1")!.priceCents).toBe(120);
  });

  it("ne touche pas aux ingrédients observés, et borne le recalage", () => {
    const wild = [mk("a1", 100, 400, "openprices"), mk("a2", 100, 400, "openprices"), mk("a3", 100, 400, "openprices")];
    const out = indexUnobserved(reference, wild, aisleOf);
    expect(out.some((p) => ["a1", "a2", "a3"].includes(p.ingredientId))).toBe(false);
    expect(out.find((p) => p.ingredientId === "a4")!.priceCents).toBe(130); // plafonné à ×1,3
  });

  it("ne fait rien sans assez de relevés pour se caler", () => {
    expect(indexUnobserved(reference, observed.slice(0, 2), aisleOf)).toEqual([]);
  });
});
