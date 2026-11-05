import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./shopping";
import { seedContext } from "./test-fixtures";

describe("buildShoppingList", () => {
  it("mutualise un ingrédient entre recettes (2 × 100 ml de crème = 1 pot de 20 cl)", () => {
    const ctx = seedContext();
    const list = buildShoppingList(new Map([["creme-liquide", 200]]), ctx);
    expect(list.lines[0]!.picks).toEqual([expect.objectContaining({ count: 1, label: "Brique 20 cl" })]);
    expect(list.totalCents).toBe(99);
  });

  it("compte 0 € si le placard couvre tout", () => {
    const ctx = seedContext({ pantry: [{ ingredientId: "riz-long", quantity: 1000 }] });
    const list = buildShoppingList(new Map([["riz-long", 300]]), ctx);
    expect(list.totalCents).toBe(0);
    expect(list.lines[0]).toMatchObject({ fromPantry: 300, toBuy: 0 });
  });

  it("achète seulement le complément, en paquet entier", () => {
    const ctx = seedContext({ pantry: [{ ingredientId: "oeuf", quantity: 3 }] });
    const list = buildShoppingList(new Map([["oeuf", 4]]), ctx);
    expect(list.lines[0]).toMatchObject({ fromPantry: 3, toBuy: 1, purchased: 6, leftover: 5 });
    expect(list.totalCents).toBe(199);
  });

  it("traite « en quantité suffisante » comme illimité (condiments)", () => {
    const ctx = seedContext({ pantry: [{ ingredientId: "sel", quantity: null }] });
    expect(buildShoppingList(new Map([["sel", 40]]), ctx).totalCents).toBe(0);
  });

  it("signale un ingrédient indisponible", () => {
    const ctx = seedContext({ unavailable: ["tofu-nature"] });
    expect(buildShoppingList(new Map([["tofu-nature", 200]]), ctx).unavailable).toEqual(["tofu-nature"]);
  });

  it("produit des totaux entiers en centimes", () => {
    const ctx = seedContext();
    const list = buildShoppingList(new Map([["pomme-de-terre", 1234.5], ["lait-demi-ecreme", 333.3]]), ctx);
    expect(Number.isInteger(list.totalCents)).toBe(true);
    expect(list.totalCents).toBe(list.lines.reduce((a, l) => a + l.costCents, 0));
  });
});
