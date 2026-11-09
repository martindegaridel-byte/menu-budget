/**
 * Construit data/store-prices.json : prix réels relevés sur Open Prices pour un magasin,
 * à partir de plusieurs magasins de la même enseigne (les prix des produits de marque
 * distributeur varient peu d'un magasin à l'autre).
 *
 * Pour chaque ingrédient et chaque contenance : prix médian entre les magasins (un relevé
 * par magasin, le plus récent), le magasin cible passant en priorité s'il a un relevé.
 *
 * Usage : npx tsx scripts/build-store-prices.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSeedData } from "../src/lib/data/seed";
import { matchOpenPrices, type MatchedPackage } from "../src/lib/pricing/openprices";
import { fetchOpenPrices } from "../src/lib/pricing/openprices-client";

interface Target {
  storeId: string;
  /** Magasin lui-même sur Open Prices (prioritaire). */
  ownLocation: number | null;
  /** Autres magasins de l'enseigne, même format. */
  locations: { id: number; city: string }[];
}

const TARGETS: Target[] = [
  {
    storeId: "super-u-saint-pierre",
    ownLocation: 2517, // Super U, 95 bd Sakakini, Marseille 5e
    locations: [
      { id: 1331, city: "Lyon 7e" },
      { id: 11, city: "Grenoble" },
      { id: 1387, city: "Paris 18e" },
      { id: 2016, city: "Lyon 3e" },
      { id: 127, city: "Veynes" },
      { id: 410, city: "Maromme" },
      { id: 5392, city: "Sisteron" },
      { id: 3762, city: "Maubec" },
      { id: 77, city: "Huningue" },
      { id: 90, city: "La Madeleine" },
    ],
  },
];

/** Relevés plus anciens ignorés. */
const SINCE = "2025-05-01";

/** Sans accents, minuscules, mots séparés. */
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
const STOP = new Set(["de", "du", "des", "la", "le", "les", "en", "au", "aux", "a", "d", "l", "et", "a", "conserve", "surgele", "surgeles", "frais", "fraiche", "sec", "secs"]);
const stem = (w: string) => w.slice(0, 5);
/** Mots qui signalent un plat préparé ou un autre produit (s'ils ne sont pas dans le nom de l'ingrédient). */
const DISH = new Set(["hache", "haches", "bouillon", "cubes", "gnocchi", "gnocchis", "pizza", "salade", "sandwich", "chips", "soupe", "veloute", "quiche", "tarte", "brioche", "biscuit", "biscuits", "gateau", "sauce", "plat", "cuisine", "cuisines", "emince", "emincee", "emiette", "nuggets", "pane", "panes", "croquettes", "gratin", "lasagnes", "raviolis", "ravioles", "tortellini", "girasoli", "torti", "nem", "nems", "bol", "poelee", "tartinade", "tartinades", "houmous", "taboule", "escalope", "bruschetta", "lit", "burger", "wrap", "feuillete", "aperitif", "friture", "dessert", "boisson", "jus", "creme", "yaourt", "fromage", "fourre", "fourree", "tarama", "caramelisees", "caramelise", "aromatise", "aromatisee"]);
/** Premiers mots d'ingrédients trop génériques pour signaler un autre aliment. */
const GENERIC_HEADS = new Set(["sauce", "pate", "pates", "huile", "lait", "pain", "pains", "poudre", "filet", "filets", "fond", "fumet", "double", "graines", "petits", "blanc", "creme", "fromage", "dos", "cuisses", "noix", "melange", "mini", "boisson", "yaourt", "sucre", "jus"]);

/**
 * Le produit correspond-il vraiment à l'ingrédient ?
 * - ses deux premiers mots significatifs figurent dans le nom du produit, le premier dès le début ;
 * - aucun mot de « plat préparé » ni aucun autre aliment du catalogue étranger à l'ingrédient.
 */
function plausible(ingredientName: string, productName: string, foodHeads: ReadonlySet<string>): boolean {
  const ing = words(ingredientName.replace(/\(.*?\)/g, "")).filter((w) => !STOP.has(w));
  const prod = words(productName).filter((w) => !STOP.has(w));
  const prodStems = prod.map(stem);
  const ingStems = new Set(ing.map(stem));
  if (!ing[0] || !prodStems.slice(0, 2).includes(stem(ing[0]))) return false;
  if (!ing.slice(0, 2).every((w) => prodStems.includes(stem(w)))) return false;
  if (prod.some((w) => DISH.has(w) && !ingStems.has(stem(w)))) return false;
  return !prodStems.some((s) => foodHeads.has(s) && !ingStems.has(s));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

async function main() {
  const seed = loadSeedData();
  const ingredients = new Map(seed.ingredients.map((i) => [i.id, i]));
  const foodHeads = new Set(
    seed.ingredients
      .map((i) => words(i.name.replace(/\(.*?\)/g, "")).filter((w) => !STOP.has(w))[0])
      .filter((w): w is string => !!w && !GENERIC_HEADS.has(w))
      .map(stem),
  );
  const out: Record<string, unknown> = {};

  for (const t of TARGETS) {
    const all = [...(t.ownLocation ? [{ id: t.ownLocation, city: "magasin" }] : []), ...t.locations];
    const perLocation = new Map<number, MatchedPackage[]>();
    for (const loc of all) {
      const prices = await fetchOpenPrices(loc.id, { since: SINCE, delayMs: 400 });
      // Fourchette plus stricte que l'import manuel : on mélange plusieurs magasins.
      const report = matchOpenPrices(prices, ingredients, seed.packages, `${t.storeId}-${loc.id}`, { since: SINCE, maxAbove: 1.6, maxBelow: 2 });
      const ok = report.packages.filter((p) => plausible(ingredients.get(p.ingredientId)!.name, p.productName, foodHeads));
      perLocation.set(loc.id, ok);
      console.log(`${loc.id} ${loc.city} : ${prices.length} relevés, ${new Set(ok.map((p) => p.ingredientId)).size} ingrédients reconnus (${report.packages.length - ok.length} écartés)`);
    }

    // Regroupement par ingrédient et contenance (arrondie à 5 %).
    const groups = new Map<string, { own?: MatchedPackage; all: MatchedPackage[] }>();
    for (const [locId, pkgs] of perLocation) {
      for (const p of pkgs) {
        const key = `${p.ingredientId}|${Math.round(Math.log(p.quantity) / Math.log(1.05))}`;
        const g = groups.get(key) ?? { all: [] };
        if (locId === t.ownLocation) g.own = p;
        else g.all.push(p);
        groups.set(key, g);
      }
    }

    const packages: { ingredientId: string; label: string; brand?: string; quantity: number; priceCents: number; asOf: string; stores: number }[] = [];
    for (const g of groups.values()) {
      const ref = g.own ?? g.all.sort((a, b) => a.priceCents - b.priceCents)[Math.floor(g.all.length / 2)]!;
      const priceCents = g.own ? g.own.priceCents : median(g.all.map((p) => p.priceCents));
      packages.push({
        ingredientId: ref.ingredientId,
        label: ref.label,
        ...(ref.brand ? { brand: ref.brand } : {}),
        quantity: ref.quantity,
        priceCents,
        asOf: [...g.all, ...(g.own ? [g.own] : [])].map((p) => p.asOf).sort().at(-1)!,
        stores: g.all.length + (g.own ? 1 : 0),
      });
    }
    // Au plus 3 contenances par ingrédient, au meilleur prix unitaire.
    const byIng = new Map<string, typeof packages>();
    for (const p of packages) byIng.set(p.ingredientId, [...(byIng.get(p.ingredientId) ?? []), p]);
    const kept = [...byIng.values()]
      .flatMap((list) => list.sort((a, b) => a.priceCents / a.quantity - b.priceCents / b.quantity).slice(0, 3))
      .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId) || a.quantity - b.quantity);

    out[t.storeId] = {
      source: "Open Prices (prices.openfoodfacts.org, licence ODbL)",
      generatedAt: new Date().toISOString().slice(0, 10),
      since: SINCE,
      locations: all.map((l) => l.id),
      packages: kept,
    };
    console.log(`→ ${t.storeId} : ${kept.length} prix pour ${byIng.size} ingrédients`);
  }

  writeFileSync(join(__dirname, "..", "data", "store-prices.json"), JSON.stringify(out, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
