import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { isPerishable } from "./perishable";

const byId = new Map(loadSeedData().ingredients.map((i) => [i.id, i]));
const p = (id: string) => isPerishable(byId.get(id)!);

describe("isPerishable", () => {
  it("pas de date de péremption pour l'épicerie sèche, les conserves, les épices, les surgelés", () => {
    for (const id of ["spaghetti", "riz-long", "lentilles-vertes", "tomates-concassees", "sel", "cumin", "petits-pois-surgeles"]) {
      expect(p(id), id).toBe(false);
    }
  });
  it("une date pour les produits frais", () => {
    for (const id of ["tomate", "filet-poulet", "oeuf", "lait-demi-ecreme", "saumon-pave", "tofu-nature", "baguette", "lardons-fumes"]) {
      expect(p(id), id).toBe(true);
    }
  });
});
