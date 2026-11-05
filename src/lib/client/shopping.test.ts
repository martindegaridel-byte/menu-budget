import { describe, expect, it } from "vitest";
import { buildShoppingList } from "@/lib/engine/shopping";
import { seedContext } from "@/lib/engine/test-fixtures";
import { groupByAisle, pantryAfterCooking, pantryAfterPurchase, pantryAfterShopping, shoppingListText } from "./shopping";

const pantry = [
  { ingredientId: "oeuf", quantity: 3 },
  { ingredientId: "sel", quantity: null },
];
const ctx = seedContext({ pantry });
const list = buildShoppingList(new Map([["oeuf", 4], ["sel", 10], ["spaghetti", 300], ["oignon-jaune", 120]]), ctx);

describe("liste de courses (client)", () => {
  it("groupe par rayon dans l'ordre du magasin", () => {
    expect(groupByAisle(list.lines).map((g) => g.aisle)).toEqual(["fruits-legumes", "cremerie", "epicerie-salee", "condiments"]);
  });

  it("produit un texte partageable avec total et placard", () => {
    const text = shoppingListText(list, { meals: 2, persons: 2, storeName: "Intermarché Super" });
    expect(text).toContain("Total estimé : ");
    expect(text).toContain("☐ Spaghetti — 1 × Paquet 500 g");
    expect(text).toContain("Déjà au placard : Sel fin");
  });

  it("met à jour le placard : consomme le stock et ajoute les restes", () => {
    const next = pantryAfterShopping(pantry, list);
    const get = (id: string) => next.find((p) => p.ingredientId === id);
    expect(get("oeuf")?.quantity).toBe(5); // 3 − 3 + (6 − 1)
    expect(get("sel")?.quantity).toBeNull();
    expect(get("spaghetti")?.quantity).toBe(200);
    expect(get("oignon-jaune")).toBeUndefined(); // acheté à l'unité, entièrement utilisé
  });

  it("après les courses, ajoute les paquets achetés au placard", () => {
    const next = pantryAfterPurchase(pantry, list);
    const get = (id: string) => next.find((p) => p.ingredientId === id);
    expect(get("oeuf")?.quantity).toBe(9); // 3 + boîte de 6
    expect(get("spaghetti")?.quantity).toBe(500);
    expect(get("sel")?.quantity).toBeNull();
  });

  it("après avoir cuisiné un plat, retire ce qu'il a utilisé", () => {
    const stocked = pantryAfterPurchase(pantry, list);
    const next = pantryAfterCooking(stocked, [
      { ingredientId: "oeuf", quantity: 4 },
      { ingredientId: "spaghetti", quantity: 500 },
      { ingredientId: "sel", quantity: 10 },
      { ingredientId: "inconnu", quantity: 1 },
    ]);
    const get = (id: string) => next.find((p) => p.ingredientId === id);
    expect(get("oeuf")?.quantity).toBe(5);
    expect(get("spaghetti")).toBeUndefined(); // épuisé : retiré du placard
    expect(get("sel")?.quantity).toBeNull(); // condiment « suffisant » : inchangé
  });
});
