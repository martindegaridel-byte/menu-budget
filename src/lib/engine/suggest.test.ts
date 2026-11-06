import { describe, expect, it } from "vitest";
import { suggestFromPantry } from "./suggest";
import { prefs, seedContext } from "./test-fixtures";

describe("Que faire avec ce que j'ai ?", () => {
  const pantry = [
    { ingredientId: "courgette", quantity: 500 },
    { ingredientId: "oeuf", quantity: 6 },
    { ingredientId: "sel", quantity: null },
  ];
  const ctx = seedContext({ pantry });
  const p = prefs({ persons: 2, maxTotalMinutes: 300 });

  it("ne propose que des recettes qui utilisent les ingrédients choisis", () => {
    const res = suggestFromPantry(p, ctx, ["courgette", "oeuf"]);
    expect(res.length).toBeGreaterThan(0);
    for (const s of res) expect(s.uses.length).toBeGreaterThan(0);
  });

  it("classe d'abord les recettes qui utilisent le plus d'ingrédients choisis, puis les moins chères", () => {
    const res = suggestFromPantry(p, ctx, ["courgette", "oeuf"]);
    for (let i = 1; i < res.length; i++) {
      const [a, b] = [res[i - 1]!, res[i]!];
      expect(a.uses.length > b.uses.length || (a.uses.length === b.uses.length && a.extraCents <= b.extraCents)).toBe(true);
    }
    expect(res[0]!.uses).toEqual(expect.arrayContaining(["courgette", "oeuf"]));
  });

  it("respecte les exclusions et les allergies", () => {
    const res = suggestFromPantry({ ...p, allergens: ["oeufs"] }, ctx, ["oeuf"]);
    expect(res).toEqual([]);
  });
});
