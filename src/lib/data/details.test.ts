import { describe, expect, it } from "vitest";
import { allRecipeDetails, quantityInText, renderDetailText, TOKEN } from "./details";
import { loadSeedData } from "./seed";

const data = loadSeedData();
const recipes = new Map(data.recipes.map((r) => [r.id, r]));

describe("instructions détaillées", () => {
  it("remplace les quantités dans le texte", () => {
    const q = new Map([
      ["riz", { quantity: 320, unit: "g" as const }],
      ["oeuf", { quantity: 3, unit: "piece" as const }],
      ["lait", { quantity: 1500, unit: "ml" as const }],
    ]);
    expect(renderDetailText("Verser {riz} de riz, casser {oeuf} œufs, ajouter {lait} de lait.", q)).toBe(
      "Verser 320 g de riz, casser 3 œufs, ajouter 1,5 L de lait.",
    );
    expect(quantityInText(1.3, "piece")).toBe("1,5");
    expect(quantityInText(8, "ml")).toBe("½ c. à soupe");
    expect(quantityInText(30, "ml")).toBe("2 c. à soupe");
    expect(renderDetailText("{cuisse|cuisse|cuisses}", new Map([["cuisse", { quantity: 500, unit: "g" as const, gramsPerPiece: 250 }]]))).toBe("2 cuisses");
    expect(renderDetailText("{oeuf|œuf|œufs} et {~1000 ml} d'eau", new Map([["oeuf", { quantity: 1, unit: "piece" as const }]]), 0.5)).toBe("1 œuf et 500 ml d'eau");
  });

  it.each(Object.entries(allRecipeDetails()))("%s : recette existante, quantités de ses propres ingrédients", (id, d) => {
    const r = recipes.get(id);
    expect(r, id).toBeDefined();
    const ids = new Set(r!.ingredients.map((l) => l.ingredientId));
    const texts = [...d.prep, ...d.steps.flatMap((s) => [s.text, s.tip ?? ""]), d.serve ?? ""];
    for (const t of texts) for (const m of t.matchAll(TOKEN)) expect(ids.has(m[1]!), `${id} → {${m[1]}}`).toBe(true);
    expect(d.steps.length).toBeGreaterThanOrEqual(r!.steps.length);
    // Forme « nombre + nom » : l'ingrédient doit se compter en pièces (ou avoir un poids moyen par pièce).
    const byIng = new Map(data.ingredients.map((i) => [i.id, i]));
    for (const t of texts)
      for (const m of t.matchAll(TOKEN))
        if (m[2]) {
          const ing = byIng.get(m[1]!)!;
          expect(ing.unit === "piece" || !!ing.gramsPerPiece, `${id} → {${m[1]}|…} se compte en ${ing.unit}`).toBe(true);
        }
  });
});
