import { describe, expect, it } from "vitest";
import { pkg } from "@/lib/engine/test-fixtures";
import { indexUnobserved, resolvePriceBook, scaleToObserved, SIZE_ELASTICITY } from "./priceBook";

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
    // Format comparable (100 g pour un flacon de 50 g ; un pot de 250 g serait trop éloigné en taille).
    const out = scaleToObserved([ref("poivre", 50, 169)], [obs("poivre", 100, 390)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(50);
    // Rapport au kilo, corrigé de la taille (format 2 fois plus grand → ×2^0,2), puis suivi à moitié (un seul relevé).
    const ratio = (390 / 100 / (169 / 50)) * 2 ** SIZE_ELASTICITY;
    expect(out[0]!.priceCents).toBe(Math.round(169 * (1 + (ratio - 1) / 2)));
    expect(out[0]!.source).toBe("openprices");
  });

  it("borne l'ajustement et ignore les ingrédients sans relevé", () => {
    const out = scaleToObserved([ref("a", 100, 100), ref("b", 100, 100)], [obs("a", 100, 1000)]);
    expect(out.map((p) => p.ingredientId)).toEqual(["a"]);
    expect(out[0]!.priceCents).toBe(160);
  });
});

describe("scaleToObserved : comparaison au format de taille la plus proche", () => {
  const mk = (ingredientId: string, quantity: number, priceCents: number, source: "estimate" | "openprices" = "estimate") =>
    ({ id: `${ingredientId}:${quantity}`, ingredientId, label: `${quantity}`, quantity, priceCents, source, asOf: "2026-10-01" }) as const;

  it("un grand format relevé ne fait pas baisser le prix d'un petit format", () => {
    // Pack de 4 yaourts 500 g à 0,99 € et seau 1 kg à 1,50 € ; relevés : seaux 1 kg à 1,65 € (+10 %).
    const obs = [mk("yaourt", 1000, 165, "openprices"), { ...mk("yaourt", 1000, 165, "openprices"), id: "b" }];
    const out = scaleToObserved([mk("yaourt", 500, 99), mk("yaourt", 1000, 150)], obs);
    expect(out.find((p) => p.quantity === 500)!.priceCents).toBe(109); // 0,99 × 1,10
  });

  it("ignore un relevé trop éloigné en taille de tout format habituel", () => {
    // Seul un seau de 2 kg est relevé pour un ingrédient vendu en pack de 500 g : aucune conclusion.
    expect(scaleToObserved([mk("yaourt", 500, 99)], [mk("yaourt", 2000, 225, "openprices")])).toEqual([]);
  });

  it("compare un prix au kilo (vrac) au format vrac", () => {
    const refs = [{ ...mk("oignon", 1000, 149), label: "Filet 1 kg" }, { ...mk("oignon", 120, 30), label: "Vrac, à l'unité (~120 g)" }];
    const kilo = { ...mk("oignon", 1000, 229, "openprices"), label: "OIGNON JAUNE VRAC — 1 kg (prix au kilo)" };
    const out = scaleToObserved(refs, [kilo, { ...kilo, id: "b" }]);
    // 2,29 €/kg contre 2,50 €/kg en vrac : −8 % (pas de correction de taille pour un prix au kilo) ;
    // le filet suit (1,49 → 1,37) au lieu de grimper à 2,29.
    expect(out.find((p) => p.quantity === 1000)!.priceCents).toBe(Math.round(149 * (2.29 / 2.5)));
  });

  it("corrige l'économie d'échelle d'un format plus grand", () => {
    // Pot de 235 g estimé 1,49 € ; deux relevés de 470 g (format double) à 2,59 €, soit −13 % au kilo :
    // c'est exactement la baisse attendue pour un format double, donc le petit pot ne baisse pas.
    const obs = [mk("mayo", 470, 259, "openprices"), { ...mk("mayo", 470, 259, "openprices"), id: "b" }];
    const out = scaleToObserved([mk("mayo", 235, 149)], obs);
    expect(Math.abs(out[0]!.priceCents - 149)).toBeLessThanOrEqual(1);
  });

  it("ne suit qu'à moitié un relevé unique", () => {
    const out = scaleToObserved([mk("beurre-cacahuete", 350, 259)], [mk("beurre-cacahuete", 350, 400, "openprices")]);
    expect(out[0]!.priceCents).toBe(Math.round(259 * (1 + (400 / 259 - 1) / 2)));
  });
});

describe("indexUnobserved (pas d'impasse sans relevé)", () => {
  const mk = (ingredientId: string, quantity: number, priceCents: number, source: "estimate" | "openprices" = "estimate") =>
    ({ id: `${ingredientId}:${quantity}`, ingredientId, label: `${quantity}`, quantity, priceCents, source, asOf: "2026-10-01" }) as const;
  const aisles: Record<string, string> = { a1: "cremerie", a2: "cremerie", a3: "cremerie", a4: "cremerie", b1: "boucherie", b2: "boucherie", c1: "conserves" };
  const aisleOf = (id: string) => aisles[id];
  const reference = Object.keys(aisles).map((id) => mk(id, 100, 100));
  // Relevés (deux par ingrédient) : +20 % sur 3 ingrédients de la crèmerie, −10 % sur 1, rien ailleurs
  const twice = (id: string, price: number) => [mk(id, 100, price, "openprices"), { ...mk(id, 100, price, "openprices"), id: `${id}:bis` }];
  const observed = [...twice("a1", 120), ...twice("a2", 120), ...twice("a3", 120), ...twice("b1", 90)];

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
    expect(indexUnobserved(reference, observed.slice(0, 4), aisleOf)).toEqual([]);
  });
});
