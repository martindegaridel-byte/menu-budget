import { describe, expect, it } from "vitest";
import { loadSeedData } from "@/lib/data/seed";
import { pkg } from "@/lib/engine/test-fixtures";
import sample from "./__fixtures__/openprices-sample.json";
import { fetchOpenPrices } from "./openprices-client";
import { candidateIngredients, matchOpenPrices, normalizeName, parseLocationId, type OpenPrice } from "./openprices";
import { resolvePriceBook } from "./priceBook";

const data = loadSeedData();
const ingredients = new Map(data.ingredients.map((i) => [i.id, i]));
const items = sample.items as OpenPrice[];
const byId = (id: number) => items.find((x) => x.id === id)!;
const match = (prices: OpenPrice[], since = "2024-11-01") => matchOpenPrices(prices, ingredients, data.packages, "test", { since });

describe("Open Prices : association produits → ingrédients", () => {
  it("normalise les noms (accents, œ, ponctuation)", () => {
    expect(normalizeName("Œufs frais élevés  en Plein-Air")).toBe("oeufs frais eleves en plein air");
  });

  it("reconnaît des produits réels", () => {
    expect(candidateIngredients(byId(145386))).toContain("oeuf");
    expect(candidateIngredients(byId(170075))).toContain("lait-demi-ecreme");
    expect(candidateIngredients(byId(86363))).toContain("champignons-conserve");
    expect(candidateIngredients(byId(121970))).toContain("banane");
  });

  it("écarte les faux amis (sorbet, légumes cuisinés en bocal)", () => {
    expect(candidateIngredients(byId(169925))).toEqual([]);
    expect(candidateIngredients(byId(86162))).not.toContain("aubergine");
    expect(candidateIngredients(byId(86363))).not.toContain("champignon-paris");
  });

  it("calcule la contenance : nombre d'œufs, prix au kilo, litre", () => {
    const r = match(items);
    const get = (id: string) => r.packages.find((p) => p.ingredientId === id)!;
    expect(get("oeuf")).toMatchObject({ quantity: 6, priceCents: 152, source: "openprices", asOf: "2025-10-04" });
    expect(get("banane")).toMatchObject({ quantity: 1000, priceCents: 98 });
    expect(get("lait-demi-ecreme")).toMatchObject({ quantity: 1000, priceCents: 94 });
  });

  it("ignore les promotions et les relevés trop anciens, garde le dernier prix d'un produit", () => {
    const lait = byId(170075);
    const promo = { ...lait, id: 1, price: 0.5, price_is_discounted: true, date: "2026-01-01" };
    const vieux = { ...lait, id: 2, price: 0.6, date: "2023-01-01" };
    const ancienRelevé = { ...lait, id: 3, price: 0.89, date: "2025-06-01" };
    const r = match([lait, promo, vieux, ancienRelevé]);
    expect(r.packages.filter((p) => p.ingredientId === "lait-demi-ecreme").map((p) => p.priceCents)).toEqual([94]);
  });

  it("rejette un prix invraisemblable par rapport à l'estimation", () => {
    const lait = byId(170075);
    const r = match([{ ...lait, id: 9, product_code: "x", price: 25 }]);
    expect(r.packages).toHaveLength(0);
    expect(r.rejectedAsImplausible).toBe(1);
  });

  it("lit l'identifiant du magasin depuis l'adresse ou le numéro", () => {
    expect(parseLocationId("https://prices.openfoodfacts.org/locations/10")).toBe(10);
    expect(parseLocationId("10")).toBe(10);
    expect(parseLocationId("abc")).toBeNull();
  });
});

describe("prix réels dans le moteur", () => {
  it("un prix Open Prices remplace toutes les estimations de l'ingrédient", () => {
    const real = { ...pkg("riz", 500, 120), source: "openprices" as const };
    const book = resolvePriceBook({
      referencePackages: [pkg("riz", 1000, 145), pkg("riz", 500, 89), pkg("pates", 500, 79)],
      store: { priceIndex: 100 },
      storePackages: [real],
    });
    expect(book.get("riz")!.map((p) => p.priceCents)).toEqual([120]);
    expect(book.get("pates")!.map((p) => p.priceCents)).toEqual([79]);
  });
});

describe("client Open Prices", () => {
  it("parcourt les pages jusqu'à la dernière, avec un en-tête User-Agent", async () => {
    const calls: string[] = [];
    const fake = async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url);
      expect(init?.headers?.["User-Agent"]).toMatch(/menu-budget/);
      const page = Number(new URL(url).searchParams.get("page"));
      return { ok: true, status: 200, json: async () => ({ items: [items[page - 1]], pages: 3 }) };
    };
    const res = await fetchOpenPrices(10, { since: "2024-11-01", delayMs: 0 }, fake);
    expect(res).toHaveLength(3);
    expect(calls[0]).toContain("location_id=10");
    expect(calls[0]).toContain("date__gte=2024-11-01");
  });

  it("explique une erreur du service", async () => {
    const fake = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchOpenPrices(10, { since: "2024-11-01", delayMs: 0 }, fake)).rejects.toThrow(/503/);
  });
});
