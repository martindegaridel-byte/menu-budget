import { describe, expect, it } from "vitest";
import type { Ingredient } from "@/lib/domain/schemas";
import { formatQuantity, toBaseQuantity, UnitConversionError } from "./units";

const base = { aisle: "epicerie-salee" as const, animal: null, allergens: [], staple: false };
const oignon: Ingredient = { ...base, id: "oignon", name: "Oignon", unit: "g", gramsPerPiece: 120 };
const lait: Ingredient = { ...base, id: "lait", name: "Lait", unit: "ml" };
const oeuf: Ingredient = { ...base, id: "oeuf", name: "Œuf", unit: "piece" };

describe("toBaseQuantity", () => {
  it("convertit masses et volumes", () => {
    expect(toBaseQuantity(1.5, "kg", oignon)).toBe(1500);
    expect(toBaseQuantity(20, "cl", lait)).toBe(200);
    expect(toBaseQuantity(2, "cs", lait)).toBe(30);
    expect(toBaseQuantity(1, "cc", oignon)).toBe(5);
  });
  it("convertit les pièces via le poids moyen", () => {
    expect(toBaseQuantity(2, "piece", oignon)).toBe(240);
    expect(toBaseQuantity(3, "piece", oeuf)).toBe(3);
  });
  it("refuse les conversions absurdes", () => {
    expect(() => toBaseQuantity(2, "piece", lait)).toThrow(UnitConversionError);
    expect(() => toBaseQuantity(100, "g", oeuf)).toThrow(UnitConversionError);
  });
});

describe("formatQuantity", () => {
  it("formate lisiblement", () => {
    expect(formatQuantity(1250, "g")).toBe("1,3 kg");
    expect(formatQuantity(250, "ml")).toBe("250 ml");
    expect(formatQuantity(1, "piece")).toBe("1 pièce");
    expect(formatQuantity(6, "piece")).toBe("6 pièces");
  });
});
