import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { parseReceipt } from "./receipt";

const ingredients = loadSeedData().ingredients.map(({ id, name, unit, staple }) => ({ id, name, unit, staple }));

const TICKET = `INTERMARCHE SUPER
CARTE FIDELITE
PATES PENNE RIGATE 500G      0,85
2 X LAIT DEMI ECREME 1L       1,90
OEUFS PLEIN AIR X12           3,69
POMMES DE TERRE 2,5KG         2,49
CAROTTES 1KG                  1,19
HUILE TOURNESOL 1L            2,15
REMISE FIDELITE              -0,50
SOUS-TOTAL                   12,27
TOTAL                        11,77
CB SANS CONTACT              11,77`;

describe("lecture d'un ticket de caisse", () => {
  const lines = parseReceipt(TICKET, ingredients);
  const find = (id: string) => lines.find((l) => l.ingredientId === id);

  it("ignore l'en-tête, les remises, les totaux et le paiement", () => {
    expect(lines.some((l) => /total|carte|cb|remise/i.test(l.raw))).toBe(false);
    expect(lines.length).toBe(6);
  });

  it("reconnaît les ingrédients et lit les contenances", () => {
    expect(find("penne")?.quantity).toBe(500);
    expect(find("lait-demi-ecreme")?.quantity).toBe(2000); // 2 × 1 L
    expect(find("oeuf")?.quantity).toBe(12);
    expect(find("pomme-de-terre")?.quantity).toBe(2500);
    expect(find("carotte")?.quantity).toBe(1000);
  });

  it("garde les condiments en « quantité suffisante » et lit les prix", () => {
    expect(find("huile-tournesol")?.quantity).toBeNull();
    expect(find("penne")?.priceCents).toBe(85);
  });

  it("signale un article inconnu sans l'inventer", () => {
    const [l] = parseReceipt("LESSIVE CONCENTREE 2L   7,99", ingredients);
    expect(l?.ingredientId).toBeNull();
  });
});
