import { describe, expect, it } from "vitest";
import type { Aisle } from "@/lib/domain/schemas";
import { cheaperSuggestions, closeness, perUnitLabel, priceDeltaPct, unitPrices } from "./substitutes";

const ing = (id: string, tags: string[], aisle: Aisle = "boucherie", animal?: string) => ({ id, tags, aisle, animal });

describe("remplaçants", () => {
  const prices = unitPrices({
    veau: [{ quantity: 1000, priceCents: 2400 }],
    porc: [{ quantity: 500, priceCents: 450 }, { quantity: 1000, priceCents: 799 }],
    dinde: [{ quantity: 1000, priceCents: 1200 }],
    tofu: [{ quantity: 400, priceCents: 250 }],
  });

  it("garde le meilleur prix unitaire de chaque ingrédient", () => {
    expect(prices.get("porc")).toBeCloseTo(0.799);
  });

  it("calcule l'écart de prix, ou rien si un prix manque", () => {
    expect(priceDeltaPct("veau", "dinde", prices)).toBe(-50);
    expect(priceDeltaPct("veau", "inconnu", prices)).toBeNull();
  });

  it("affiche au kilo, au litre ou à la pièce", () => {
    expect(perUnitLabel(0.799, "g")).toEqual({ cents: 799, per: "kg" });
    expect(perUnitLabel(0.2, "ml")).toEqual({ cents: 200, per: "L" });
    expect(perUnitLabel(35, "piece")).toEqual({ cents: 35, per: "pièce" });
  });

  it("suggère des remplaçants proches et nettement moins chers, les plus proches d'abord", () => {
    const veau = ing("veau", ["viande-blanche"], "boucherie", "viande");
    const porc = ing("porc", ["porc"], "boucherie", "viande");
    const dinde = ing("dinde", ["viande-blanche"], "boucherie", "viande");
    const tofu = ing("tofu", [], "vegetal");
    expect(closeness(veau, dinde)).toBeGreaterThan(closeness(veau, porc));
    // porc est moins cher mais pas de la même famille ; tofu n'est pas proche.
    expect(cheaperSuggestions(veau, [porc, dinde, tofu], prices).map((x) => x.id)).toEqual(["dinde"]);
  });

  it("ne suggère rien de plus cher ou presque au même prix", () => {
    const dinde = ing("dinde", ["viande-blanche"]);
    const veau = ing("veau", ["viande-blanche"]);
    expect(cheaperSuggestions(dinde, [veau], prices)).toEqual([]);
  });
});
