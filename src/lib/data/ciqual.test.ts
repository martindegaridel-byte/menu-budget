import { describe, expect, it } from "vitest";
import extract from "../../../data/ciqual-extract.json";
import map from "../../../data/ciqual-map.json";
import { loadSeedData } from "./seed";

type Entry = { code: string; name: string; factor: number } | { code: null; reason: string };
const entries = map.ingredients as Record<string, Entry>;
const foods = extract.foods as Record<string, { kcal: number; protein: number; carbs: number; fat: number }>;

describe("nutrition d'après la table Ciqual 2025 (Anses)", () => {
  const { ingredients } = loadSeedData();

  it("chaque ingrédient est associé à un aliment Ciqual, ou dit pourquoi il ne l'est pas", () => {
    for (const ing of ingredients) {
      const e = entries[ing.id];
      expect(e, ing.id).toBeDefined();
      if (e!.code === null) expect(e!.reason.length, ing.id).toBeGreaterThan(5);
      else expect(foods[e!.code], `${ing.id} → ${e!.code}`).toBeDefined();
    }
    expect(Object.keys(entries).sort()).toEqual(ingredients.map((i) => i.id).sort());
  });

  it("les valeurs des ingrédients associés sont celles de Ciqual, ramenées à leur unité", () => {
    for (const ing of ingredients) {
      const e = entries[ing.id];
      if (!e || e.code === null) continue;
      const f = foods[e.code]!;
      const k = e.factor / 100;
      const got = ing.nutrition!;
      expect(Math.abs(got.kcal - f.kcal * k), `${ing.id} kcal`).toBeLessThanOrEqual(0.51);
      for (const key of ["protein", "carbs", "fat"] as const) expect(Math.abs(got[key] - f[key] * k), `${ing.id} ${key}`).toBeLessThanOrEqual(0.051);
    }
  });

  it("des repères connus restent cohérents", () => {
    const n = (id: string) => ingredients.find((i) => i.id === id)!.nutrition!;
    expect(n("oeuf").kcal).toBeGreaterThan(70); // un œuf moyen ≈ 77 kcal
    expect(n("oeuf").kcal).toBeLessThan(90);
    expect(n("huile-olive").kcal).toBeGreaterThan(800); // pour 100 ml
    expect(n("sel").kcal).toBe(0);
    expect(n("baguette").kcal).toBeGreaterThan(600); // une baguette de 250 g
  });
});
