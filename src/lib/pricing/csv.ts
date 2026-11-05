import type { Ingredient } from "@/lib/domain/schemas";
import { eurosToCents } from "@/lib/engine/money";

export interface ImportedPrice {
  line: number;
  ingredientId: string;
  label: string;
  quantity: number; // unité de base de l'ingrédient
  priceCents: number;
}

export interface CsvImportResult {
  rows: ImportedPrice[];
  errors: { line: number; message: string }[];
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const UNIT_FACTORS: Record<string, { base: Ingredient["unit"]; factor: number }> = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  l: { base: "ml", factor: 1000 },
  piece: { base: "piece", factor: 1 },
  pieces: { base: "piece", factor: 1 },
  pc: { base: "piece", factor: 1 },
  u: { base: "piece", factor: 1 },
  unite: { base: "piece", factor: 1 },
};

/**
 * Import de prix au format CSV (séparateur « ; » ou « , » ou tabulation) :
 *   ingrédient ; libellé du format ; quantité ; unité ; prix
 *   riz-long ; Paquet 1 kg ; 1 ; kg ; 1,39
 *   Lait demi-écrémé ; Brique 1 L ; 1 ; l ; 0,95 €
 * L'ingrédient est reconnu par son identifiant ou son nom exact (accents ignorés).
 * Une ligne d'en-tête éventuelle est ignorée.
 */
export function parsePriceCsv(csv: string, ingredients: readonly Ingredient[]): CsvImportResult {
  const byKey = new Map<string, Ingredient>();
  for (const i of ingredients) {
    byKey.set(normalize(i.id), i);
    byKey.set(normalize(i.name), i);
  }
  const rows: ImportedPrice[] = [];
  const errors: CsvImportResult["errors"] = [];

  csv.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const sep = raw.includes(";") ? ";" : raw.includes("\t") ? "\t" : ",";
    const cells = raw.split(sep).map((c) => c.trim());
    if (line === 1 && /ingr/i.test(cells[0] ?? "")) return; // en-tête
    if (cells.length < 5) {
      errors.push({ line, message: "5 colonnes attendues : ingrédient ; format ; quantité ; unité ; prix" });
      return;
    }
    const [name, label, qtyRaw, unitRaw, priceRaw] = cells as [string, string, string, string, string];
    const ingredient = byKey.get(normalize(name));
    if (!ingredient) {
      errors.push({ line, message: `Ingrédient inconnu : « ${name} »` });
      return;
    }
    const unit = UNIT_FACTORS[normalize(unitRaw).replace(/s$/, "") === "piece" ? "piece" : normalize(unitRaw)];
    if (!unit) {
      errors.push({ line, message: `Unité inconnue : « ${unitRaw} » (g, kg, ml, cl, l, pièce)` });
      return;
    }
    if (unit.base !== ingredient.unit) {
      errors.push({ line, message: `« ${ingredient.name} » se mesure en ${ingredient.unit}, pas en ${unitRaw}` });
      return;
    }
    const qty = Number(qtyRaw.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ line, message: `Quantité invalide : « ${qtyRaw} »` });
      return;
    }
    let priceCents: number;
    try {
      priceCents = eurosToCents(priceRaw.replace(/€|eur/gi, "").replace(/\s/g, ""));
    } catch {
      errors.push({ line, message: `Prix invalide : « ${priceRaw} »` });
      return;
    }
    if (priceCents < 0 || priceCents > 100_000) {
      errors.push({ line, message: `Prix hors limites : « ${priceRaw} »` });
      return;
    }
    rows.push({ line, ingredientId: ingredient.id, label: label || `${qtyRaw} ${unitRaw}`, quantity: qty * unit.factor, priceCents });
  });
  return { rows, errors };
}
