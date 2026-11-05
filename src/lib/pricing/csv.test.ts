import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { parsePriceCsv } from "./csv";

const { ingredients } = loadSeedData();

describe("parsePriceCsv", () => {
  it("lit identifiants, noms accentués, unités et prix français", () => {
    const res = parsePriceCsv(
      "ingrédient;format;quantité;unité;prix\nriz-long;Paquet 1 kg;1;kg;1,39\nLAIT DEMI-ECREME;Brique 1 L;1;l;0,95 €\nœuf (plein air);Boîte de 6;6;pièces;2.10",
      ingredients,
    );
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      expect.objectContaining({ ingredientId: "riz-long", quantity: 1000, priceCents: 139 }),
      expect.objectContaining({ ingredientId: "lait-demi-ecreme", quantity: 1000, priceCents: 95 }),
      expect.objectContaining({ ingredientId: "oeuf", quantity: 6, priceCents: 210 }),
    ]);
  });

  it("signale les lignes invalides sans bloquer les autres", () => {
    const res = parsePriceCsv("truc;x;1;kg;1\nriz-long;x;1;l;1\nriz-long;x;abc;kg;1\nriz-long;x;1;kg;1,20", ingredients);
    expect(res.rows).toHaveLength(1);
    expect(res.errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });
});
