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
  /**
   * `tier` : cercle de proximité (0 = le plus proche). Pour chaque produit, on prend la médiane
   * du cercle le plus proche qui a un relevé. Sans `tier` : cercle 0.
   */
  locations: { id: number; city: string; tier?: number }[];
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
  {
    storeId: "intermarche-super",
    ownLocation: null,
    // Toutes les Intermarché relevées sur Open Prices (sans Express ni Contact), en trois cercles.
    locations: [
      // 0 — Grenoble et l'Isère
      { id: 10, city: "Grenoble", tier: 0 },
      { id: 34, city: "Bresson", tier: 0 },
      { id: 35, city: "Grenoble", tier: 0 },
      { id: 2889, city: "Domène", tier: 0 },
      { id: 1542, city: "Grenoble", tier: 0 },
      { id: 932, city: "Le Bourg-d'Oisans", tier: 0 },
      { id: 2611, city: "Varces", tier: 0 },
      { id: 1166, city: "Vizille", tier: 0 },
      { id: 849, city: "La Mure", tier: 0 },
      { id: 2207, city: "Apprieu", tier: 0 },
      // 1 — reste d'Auvergne-Rhône-Alpes
      { id: 6835, city: "Bourg-de-Thizy", tier: 1 },
      { id: 1817, city: "Amplepuis", tier: 1 },
      { id: 6915, city: "Lyon 8e", tier: 1 },
      { id: 5985, city: "Craponne", tier: 1 },
      { id: 4409, city: "Port", tier: 1 },
      { id: 5322, city: "Lyon 7e", tier: 1 },
      { id: 163, city: "Saint-Flour", tier: 1 },
      { id: 2211, city: "Saint-Genis-Pouilly", tier: 1 },
      { id: 3557, city: "Sainte-Marie-de-Cuines", tier: 1 },
      { id: 2373, city: "Mauriac", tier: 1 },
      // 2 — reste de la France
      { id: 2738, city: "Lunel", tier: 2 },
      { id: 2217, city: "Clichy", tier: 2 },
      { id: 3269, city: "Jarville-la-Malgrange", tier: 2 },
      { id: 1303, city: "Rennes", tier: 2 },
      { id: 119, city: "Mons-en-Barœul", tier: 2 },
      { id: 5751, city: "La Rochelle", tier: 2 },
      { id: 3806, city: "Gap", tier: 2 },
      { id: 130, city: "Aulnay-sous-Bois", tier: 2 },
      { id: 2680, city: "Avèze", tier: 2 },
      { id: 5369, city: "Le Thillot", tier: 2 },
      { id: 1263, city: "Aulnay", tier: 2 },
      { id: 148, city: "Bezons", tier: 2 },
      { id: 135, city: "Toulouse", tier: 2 },
      { id: 3626, city: "Soorts-Hossegor", tier: 2 },
      { id: 5451, city: "La Réole", tier: 2 },
      { id: 4161, city: "Avallon", tier: 2 },
      { id: 280, city: "Paris", tier: 2 },
      { id: 1112, city: "Paris", tier: 2 },
      { id: 2735, city: "Sedan", tier: 2 },
      { id: 2733, city: "Givet", tier: 2 },
      { id: 3218, city: "Carvin", tier: 2 },
      { id: 717, city: "Rennes", tier: 2 },
      { id: 3792, city: "Peipin", tier: 2 },
      { id: 2711, city: "Langres", tier: 2 },
      { id: 1755, city: "Gentilly", tier: 2 },
      { id: 360, city: "Hyères", tier: 2 },
      { id: 2841, city: "Plouescat", tier: 2 },
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
const DISH = new Set(["hache", "haches", "bouillon", "cubes", "gnocchi", "gnocchis", "pizza", "salade", "sandwich", "chips", "soupe", "veloute", "quiche", "tarte", "brioche", "biscuit", "biscuits", "gateau", "sauce", "plat", "cuisine", "cuisines", "emince", "emincee", "emiette", "nuggets", "pane", "panes", "croquettes", "gratin", "lasagnes", "raviolis", "ravioles", "tortellini", "girasoli", "torti", "nem", "nems", "bol", "poelee", "tartinade", "tartinades", "houmous", "taboule", "escalope", "bruschetta", "lit", "burger", "wrap", "feuillete", "aperitif", "friture", "dessert", "boisson", "jus", "creme", "yaourt", "fromage", "fourre", "fourree", "tarama", "puree", "sugo", "bio", "caramelisees", "caramelise", "aromatise", "aromatisee"]);
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
  const trends: Record<string, Record<string, [string, number, number][]>> = {};

  for (const t of TARGETS) {
    const all = [...(t.ownLocation ? [{ id: t.ownLocation, city: "magasin" }] : []), ...t.locations];
    const perLocation = new Map<number, MatchedPackage[]>();
    const monthly = new Map<string, number[]>();
    for (const loc of all) {
      const prices = await fetchOpenPrices(loc.id, { since: SINCE, delayMs: 400 });
      // Fourchette plus stricte que l'import manuel : on mélange plusieurs magasins.
      const report = matchOpenPrices(prices, ingredients, seed.packages, `${t.storeId}-${loc.id}`, { since: SINCE, maxAbove: 1.6, maxBelow: 2 });
      const ok = report.packages.filter((p) => plausible(ingredients.get(p.ingredientId)!.name, p.productName, foodHeads));
      perLocation.set(loc.id, ok);
      // Évolution : mêmes règles, mois par mois (tous les relevés du mois, pas seulement le dernier).
      const byMonth = new Map<string, typeof prices>();
      for (const pr of prices) byMonth.set(pr.date.slice(0, 7), [...(byMonth.get(pr.date.slice(0, 7)) ?? []), pr]);
      for (const [month, monthPrices] of byMonth) {
        const r = matchOpenPrices(monthPrices, ingredients, seed.packages, "trend", { since: `${month}-01`, maxAbove: 1.6, maxBelow: 2 });
        for (const p of r.packages) {
          if (!plausible(ingredients.get(p.ingredientId)!.name, p.productName, foodHeads)) continue;
          const key = `${p.ingredientId}|${month}`;
          monthly.set(key, [...(monthly.get(key) ?? []), p.priceCents / p.quantity]);
        }
      }
      console.log(`${loc.id} ${loc.city} : ${prices.length} relevés, ${new Set(ok.map((p) => p.ingredientId)).size} ingrédients reconnus (${report.packages.length - ok.length} écartés)`);
    }

    // Regroupement par ingrédient et contenance (arrondie à 5 %).
    const tierOf = new Map(t.locations.map((l) => [l.id, l.tier ?? 0]));
    type Group = { own?: MatchedPackage; all: MatchedPackage[]; byTier: Map<number, MatchedPackage[]> };
    const groups = new Map<string, Group>();
    for (const [locId, pkgs] of perLocation) {
      for (const p of pkgs) {
        const key = `${p.ingredientId}|${Math.round(Math.log(p.quantity) / Math.log(1.05))}`;
        const g: Group = groups.get(key) ?? { all: [], byTier: new Map() };
        if (locId === t.ownLocation) g.own = p;
        else {
          g.all.push(p);
          const tier = tierOf.get(locId) ?? 0;
          g.byTier.set(tier, [...(g.byTier.get(tier) ?? []), p]);
        }
        groups.set(key, g);
      }
    }

    const packages: { ingredientId: string; label: string; brand?: string; quantity: number; priceCents: number; asOf: string; stores: number }[] = [];
    for (const g of groups.values()) {
      const ref = g.own ?? g.all.sort((a, b) => a.priceCents - b.priceCents)[Math.floor(g.all.length / 2)]!;
      const closest = [...g.byTier.entries()].sort((x, y) => x[0] - y[0])[0]?.[1] ?? g.all;
      const priceCents = g.own ? g.own.priceCents : median(closest.map((p) => p.priceCents));
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
    // Prix médian au kilo / litre / pièce, par mois ; ingrédients relevés au moins 3 mois.
    const series = new Map<string, [string, number, number][]>();
    for (const [key, units] of monthly) {
      const [id, month] = key.split("|") as [string, string];
      const per = ingredients.get(id)!.unit === "piece" ? 1 : 1000;
      const sorted = [...units].sort((a, b) => a - b);
      series.set(id, [...(series.get(id) ?? []), [month, Math.round(sorted[Math.floor(sorted.length / 2)]! * per), units.length]]);
    }
    trends[t.storeId] = Object.fromEntries(
      [...series.entries()].filter(([, pts]) => pts.length >= 3).map(([id, pts]) => [id, pts.sort((a, b) => a[0].localeCompare(b[0]))]),
    );
    console.log(`→ évolution : ${Object.keys(trends[t.storeId]!).length} ingrédients suivis`);
    console.log(`→ ${t.storeId} : ${kept.length} prix pour ${byIng.size} ingrédients`);
  }

  writeFileSync(join(__dirname, "..", "data", "store-prices.json"), JSON.stringify(out, null, 1) + "\n");
  writeFileSync(
    join(__dirname, "..", "data", "price-trends.json"),
    JSON.stringify({ source: "Open Prices (licence ODbL)", generatedAt: new Date().toISOString().slice(0, 10), unit: "centimes par kg, L ou pièce", stores: trends }) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
