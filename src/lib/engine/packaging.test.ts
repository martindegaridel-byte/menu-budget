import { describe, expect, it } from "vitest";
import { cheapestCover } from "./packaging";
import { pkg } from "./test-fixtures";

describe("cheapestCover (conditionnement réel)", () => {
  it("achète le paquet entier : 37 g de farine = 1 paquet de 1 kg", () => {
    const c = cheapestCover(37, [pkg("farine", 1000, 79)]);
    expect(c).toMatchObject({ counts: [1], costCents: 79, quantity: 1000 });
  });

  it("combine les formats au moindre coût (1,2 kg → 1 kg + 500 g)", () => {
    const c = cheapestCover(1200, [pkg("riz", 500, 89), pkg("riz", 1000, 145)]);
    expect(c?.costCents).toBe(145 + 89);
    expect(c?.counts).toEqual([1, 1]);
  });

  it("préfère deux petits formats s'ils sont moins chers qu'un grand", () => {
    const c = cheapestCover(900, [pkg("x", 500, 100), pkg("x", 1000, 250)]);
    expect(c?.costCents).toBe(200);
  });

  it("à coût égal, minimise le surplus", () => {
    const c = cheapestCover(400, [pkg("x", 1000, 100), pkg("x", 500, 100)]);
    expect(c?.quantity).toBe(500);
  });

  it("renvoie un coût nul pour un besoin nul et null sans conditionnement", () => {
    expect(cheapestCover(0, [pkg("x", 100, 50)])?.costCents).toBe(0);
    expect(cheapestCover(10, [])).toBeNull();
  });

  it("tolère les imprécisions flottantes (3 × 0,1 L = 300 ml)", () => {
    const c = cheapestCover(0.1 * 3 * 1000, [pkg("lait", 300, 90)]);
    expect(c?.counts).toEqual([1]);
  });
});
