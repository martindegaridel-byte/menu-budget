import type { BaseUnit } from "@/lib/domain/schemas";
import { candidatesForName, isExcludedProduct, normalizeName } from "./openprices";

/**
 * Lecture d'un ticket de caisse collé en texte (copié depuis une photo ou un ticket
 * dématérialisé) : une ligne = un article. On repère le multiplicateur (« 2 x »), la
 * contenance (« 500G », « 1,5KG », « X12 »), le prix, puis l'ingrédient de l'appli.
 */

export interface ReceiptIngredient {
  id: string;
  name: string;
  unit: BaseUnit;
  staple: boolean;
}

export interface ReceiptLine {
  raw: string;
  /** Libellé nettoyé (sans prix ni quantités). */
  label: string;
  ingredientId: string | null;
  /** Autres ingrédients possibles (pour corriger en un choix). */
  alternatives: string[];
  /** Quantité en unité de base de l'ingrédient (null = à préciser). */
  quantity: number | null;
  /** Quantité lue sur le ticket (sinon estimée par défaut). */
  quantityFromTicket: boolean;
  priceCents: number | null;
}

/** Lignes qui ne sont pas des articles. */
const NOT_AN_ITEM =
  /\b(total|sous total|s total|tva|cb|carte|visa|mastercard|especes|rendu|monnaie|remise|reduction|fidelite|avantage|cagnotte|ticket|merci|bienvenue|caisse|siret|tel|magasin|date|heure|article|nombre|a payer|paiement|contactless|sans contact|bon d achat|points?)\b/;

/** Abréviations fréquentes des tickets. */
const ABBREV: [RegExp, string][] = [
  [/\bpdt\b/g, "pommes de terre"],
  [/\bp ?d ?terre\b/g, "pommes de terre"],
  [/\becr\b|\becreme\b/g, "ecreme"],
  [/\bdemi ?ecr\b/g, "demi ecreme"],
  [/\bfrom\b/g, "fromage"],
  [/\bjamb\b/g, "jambon"],
  [/\bpoul\b/g, "poulet"],
  [/\bfil\b/g, "filet"],
  [/\bconc\b/g, "concassees"],
  [/\btom\b/g, "tomates"],
  [/\bcreme fr\b/g, "creme fraiche"],
  [/\bbeur\b/g, "beurre"],
  [/\bemment?\b/g, "emmental"],
  [/\brape\b/g, "rape"],
  [/\bsurg\b/g, "surgeles"],
  [/\bchamp\b/g, "champignons"],
  [/\boeufs? pa\b/g, "oeufs plein air"],
  [/\bhar\b/g, "haricots"],
  [/\blent\b/g, "lentilles"],
  [/\bspag+h?\b/g, "spaghetti"],
];

/** Mots trop génériques pour identifier un ingrédient. */
const STOP = new Set(["de", "du", "des", "la", "le", "les", "au", "aux", "a", "en", "et", "x", "pc", "pcs", "lot", "bio", "marque", "repere", "nature", "frais", "fraiche", "fraiches", "entier", "entiere"]);

const SIZE = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|cl|ml)\b/;
const PIECES = /\b(?:x\s?(\d{1,2})|(\d{1,2})\s?(?:x|oeufs?|pieces?|pcs?|tranches?))\b/;
const PRICE_END = /(-?\d{1,3}[.,]\d{2})\s*(?:€|eur)?\s*[a-z]?\s*$/i;
const MULT_START = /^\s*(\d{1,2})\s*[x*]\s+/i;
const MULT_PRICE = /\b(\d{1,2})\s*[x*]\s*\d{1,3}[.,]\d{2}\b/i;

const TO_BASE: Record<string, { unit: "g" | "ml"; f: number }> = {
  kg: { unit: "g", f: 1000 },
  g: { unit: "g", f: 1 },
  gr: { unit: "g", f: 1 },
  l: { unit: "ml", f: 1000 },
  cl: { unit: "ml", f: 10 },
  ml: { unit: "ml", f: 1 },
};

const tokens = (s: string) => normalizeName(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));

/** Quantité par défaut quand le ticket ne l'indique pas. */
function defaultQuantity(ing: ReceiptIngredient): number | null {
  if (ing.staple) return null;
  return ing.unit === "piece" ? 1 : 500;
}

export function parseReceipt(text: string, ingredients: readonly ReceiptIngredient[]): ReceiptLine[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const index = ingredients.map((i) => ({ id: i.id, toks: tokens(i.name) }));
  const out: ReceiptLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 3) continue;
    let norm = normalizeName(line.replace(/,/g, "."));
    if (NOT_AN_ITEM.test(norm) || !/[a-z]{3}/.test(norm)) continue;

    // Prix en fin de ligne et multiplicateur (« 2 x 1,29 » ou « 2 X LAIT… »).
    const priceMatch = line.match(PRICE_END);
    const priceCents = priceMatch ? Math.round(Number(priceMatch[1]!.replace(",", ".")) * 100) : null;
    if (priceCents !== null && priceCents <= 0) continue; // remises
    const multMatch = line.match(MULT_START) ?? line.match(MULT_PRICE);
    const mult = multMatch ? Number(multMatch[1]) : 1;

    for (const [re, rep] of ABBREV) norm = norm.replace(re, rep);
    // Contenance lue sur la ligne brute (la normalisation retire la virgule décimale).
    const size = line.toLowerCase().match(SIZE);
    const pieces = norm.match(PIECES);
    const label = norm
      .replace(PRICE_END, "")
      .replace(SIZE, " ")
      .replace(/^\d{1,2} x /, "")
      .replace(/\b\d+([.,]\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (label.length < 3) continue;

    // 1) Règles de l'import Open Prices ; 2) sinon, mots du nom de l'ingrédient.
    let candidates = candidatesForName(label).filter((id) => byId.has(id));
    if (candidates.length === 0 && !isExcludedProduct(label)) {
      const lt = new Set(tokens(label));
      const hit = (t: string) => lt.has(t) || [...lt].some((w) => w.length >= 5 && (w.startsWith(t) || t.startsWith(w)));
      candidates = index
        // Le mot principal de l'ingrédient (« crème » dans « crème liquide ») doit être présent.
        .filter((i) => i.toks.length > 0 && hit(i.toks[0]!))
        .map((i) => ({ id: i.id, score: i.toks.filter(hit).length / Math.max(1, i.toks.length) }))
        .filter((x) => x.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.id);
    }
    const ingredientId = candidates[0] ?? null;
    if (!ingredientId && priceCents === null) continue; // en-tête, adresse…
    const ing = ingredientId ? byId.get(ingredientId)! : null;

    let quantity: number | null = null;
    let fromTicket = false;
    if (ing) {
      if (ing.unit === "piece") {
        const n = pieces ? Number(pieces[1] ?? pieces[2]) : null;
        quantity = (n && n > 0 ? n : 1) * mult;
        fromTicket = !!n || mult > 1;
      } else if (size) {
        const conv = TO_BASE[size[2]!]!;
        quantity = Math.round(Number(size[1]!.replace(",", ".")) * conv.f * mult);
        fromTicket = true;
      } else {
        const d = defaultQuantity(ing);
        quantity = d === null ? null : d * mult;
      }
      if (ing.staple) quantity = null;
    }
    out.push({ raw: line, label, ingredientId, alternatives: candidates.slice(1, 4), quantity, quantityFromTicket: fromTicket, priceCents });
  }
  return out;
}
