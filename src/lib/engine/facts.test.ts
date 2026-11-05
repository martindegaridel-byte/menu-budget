import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { deriveRecipeFacts, derivedTags } from "./facts";

const data = loadSeedData();
const ingredients = new Map(data.ingredients.map((i) => [i.id, i]));
const facts = (id: string) => deriveRecipeFacts(data.recipes.find((r) => r.id === id)!, ingredients);

describe("faits déduits des ingrédients", () => {
  it("détecte le gluten de la semoule (tajine) et la protéine principale", () => {
    const f = facts("tajine-poulet-citron");
    expect(f.glutenFree).toBe(false);
    expect(f.protein).toBe("volaille");
    expect(f.diet).toBe("omnivore");
  });

  it("carbonara : base pâtes, protéine porc, allergènes œufs, lait, gluten", () => {
    const f = facts("spaghetti-carbonara");
    expect(f.base).toBe("pates");
    expect(f.protein).toBe("porc");
    expect(f.allergens).toEqual(expect.arrayContaining(["gluten", "lait", "oeufs"]));
    expect(f.quick).toBe(true);
  });

  it("dal de lentilles : vegan, légumineuses, sans gluten", () => {
    const f = facts("dal-lentilles-corail");
    expect(f.diet).toBe("vegan");
    expect(f.protein).toBe("legumineuses");
    expect(derivedTags(f)).toEqual(expect.arrayContaining(["vegan", "vegetarien", "sans-gluten"]));
  });

  it("n'est « rapide » qu'à 25 min au plus", () => {
    for (const r of data.recipes) {
      expect(deriveRecipeFacts(r, ingredients).quick, r.id).toBe(r.prepMinutes + r.cookMinutes <= 25);
    }
  });
});
