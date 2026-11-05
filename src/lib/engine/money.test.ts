import { describe, expect, it } from "vitest";
import { divideCeil, eurosToCents, formatEuros } from "./money";

describe("money", () => {
  it("convertit les euros en centimes sans erreur de flottant", () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents("12,50")).toBe(1250);
    expect(eurosToCents(19.99)).toBe(1999);
  });
  it("formate en français", () => {
    expect(formatEuros(230)).toBe("2,30 €");
    expect(formatEuros(123456)).toBe("1 234,56 €");
  });
  it("divise en arrondissant au centime supérieur", () => {
    expect(divideCeil(1000, 3)).toBe(334);
  });
  it("rejette une saisie invalide", () => {
    expect(() => eurosToCents("abc")).toThrow();
  });
});
