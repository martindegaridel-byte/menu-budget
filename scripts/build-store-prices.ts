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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSeedData } from "../src/lib/data/seed";
import { matchOpenPrices, type MatchedPackage } from "../src/lib/pricing/openprices";
import { fetchOpenPrices } from "../src/lib/pricing/openprices-client";
import { GENERIC_HEADS, median, plausible, STOP, stem, words } from "./price-match";

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
      // 3 — magasins Super U (enseigne voisine, prix très proches)
      { id: 1331, city: "Super U Lyon 7e", tier: 3 },
      { id: 1057, city: "Super U Lyon", tier: 3 },
      { id: 11, city: "Super U Grenoble", tier: 3 },
      { id: 1387, city: "Super U Paris 18e", tier: 3 },
      { id: 2016, city: "Super U Lyon 3e", tier: 3 },
      { id: 90, city: "Super U La Madeleine", tier: 3 },
      { id: 5392, city: "Super U Sisteron", tier: 3 },
      // 4 — grandes surfaces de la région grenobloise et lyonnaise
      { id: 3, city: "Auchan Grenoble", tier: 4 },
      { id: 171, city: "E.Leclerc Échirolles", tier: 4 },
      { id: 2015, city: "E.Leclerc Saint-Martin-d'Hères", tier: 4 },
      { id: 33, city: "Carrefour Villeurbanne", tier: 4 },
      { id: 1231, city: "Auchan Supermarché Lyon", tier: 4 },
      { id: 401, city: "Carrefour Market Miribel", tier: 4 },
      { id: 154, city: "Auchan Belley", tier: 4 },
      // 5 — grandes surfaces du reste de la France
      { id: 1920, city: "E.Leclerc Clichy", tier: 5 },
      { id: 4973, city: "E.Leclerc Gennevilliers", tier: 5 },
      { id: 2224, city: "Carrefour Market Paris", tier: 5 },
      { id: 5586, city: "Carrefour Gennevilliers", tier: 5 },
      { id: 3200, city: "E.Leclerc Vandœuvre", tier: 5 },
      { id: 5395, city: "E.Leclerc Nancy", tier: 5 },
      { id: 271, city: "Auchan Nancy", tier: 5 },
      { id: 400, city: "E.Leclerc Canteleu", tier: 5 },
      { id: 1579, city: "E.Leclerc Montélimar", tier: 5 },
      { id: 5028, city: "Auchan Laxou", tier: 5 },
      { id: 5235, city: "Auchan Supermarché Bagneux", tier: 5 },
      { id: 3877, city: "Carrefour Arcueil", tier: 5 },
    ],
  },
];

/**
 * Cache disque des relevés bruts (variable PRICE_CACHE_DIR) : permet de rejouer le calcul
 * sans refaire des centaines de requêtes sur un service communautaire.
 */
async function cachedPrices(locId: number, since: string) {
  const dir = process.env.PRICE_CACHE_DIR;
  const file = dir ? join(dir, `loc-${locId}-${since}.json`) : null;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Awaited<ReturnType<typeof fetchOpenPrices>>;
  const prices = await fetchOpenPrices(locId, { since, delayMs: 400 });
  if (file && dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(prices));
  }
  return prices;
}

/** Relevés plus anciens ignorés. */
const SINCE = "2025-05-01";

async function main() {
  const seed = loadSeedData();
  const ingredients = new Map(seed.ingredients.map((i) => [i.id, i]));
  const foodHeads = new Set(
    seed.ingredients
      .map((i) => words(i.name.replace(/\(.*?\)/g, "")).filter((w) => !STOP.has(w))[0])
      .filter((w): w is string => !!w && !GENERIC_HEADS.has(w))
      .map(stem),
  );
  // Format plausible : ni minuscule ni géant par rapport aux conditionnements habituels (tranches de rôti cuit, lot de 6 kg…).
  const refQty = new Map<string, number[]>();
  for (const p of seed.packages) refQty.set(p.ingredientId, [...(refQty.get(p.ingredientId) ?? []), p.quantity]);
  const plausibleSize = (p: { ingredientId: string; quantity: number }) => {
    const q = refQty.get(p.ingredientId);
    return !q || (p.quantity >= 0.25 * Math.min(...q) && p.quantity <= 5 * Math.max(...q));
  };
  // Conserves : nos formats sont en poids égoutté (« Boîte 400 g (égoutté 265 g) »), Open Prices donne le poids net.
  // Une quantité nettement sous le poids net habituel est déjà un poids égoutté (« boîte 1/2, 250 g ») : pas de conversion.
  const drain = new Map<string, { ratio: number; gross: number }>();
  for (const p of seed.packages) {
    const m = p.label.match(/(\d+)\s*g\s*\(égoutté\s*(\d+)\s*g\)/i);
    if (m) drain.set(p.ingredientId, { ratio: Number(m[2]) / Number(m[1]), gross: Number(m[1]) });
  }
  const toDrained = <P extends { ingredientId: string; quantity: number; productName: string }>(p: P): P => {
    const d = drain.get(p.ingredientId);
    // Tailles de boîtes standard : 1/2 = 400 g net / 250-265 g égouttés ; 4/4 = 800 g net / 500-530 g égouttés.
    const drainedSize = (p.quantity >= 240 && p.quantity <= 275) || (p.quantity >= 490 && p.quantity <= 540);
    if (!d || /égoutt|egoutt/i.test(p.productName) || drainedSize || p.quantity < 0.9 * d.gross) return p;
    return { ...p, quantity: Math.round(p.quantity * d.ratio) };
  };
  // Quantité contredite par le nom (« Huile 1L » enregistrée en 2 L) : relevé écarté, sauf lot (x4, 2x500 g…).
  const UNIT_G: Record<string, number> = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };
  const consistentQuantity = (p: { ingredientId: string; quantity: number; productName: string; label: string }) => {
    const ing = ingredients.get(p.ingredientId);
    // Sans gluten (marque Schär comprise) pour un ingrédient ordinaire ; « mini » pour un produit vendu à la pièce.
    if (/sch[äa]r|sans gluten/i.test(`${p.label} ${p.productName}`) && !/gluten/i.test(ing?.name ?? "")) return false;
    if (ing?.unit === "piece") return !/\bmini\b/i.test(p.productName);
    const name = p.productName.toLowerCase();
    if (/\b\d+\s*x\b|\bx\s*\d+|\blot\b|\+/.test(name)) return true;
    const m = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/);
    if (!m) return true;
    const stated = Number(m[1]!.replace(",", ".")) * UNIT_G[m[2]!]!;
    return Math.abs(stated - p.quantity) / p.quantity <= 0.15;
  };
  const out: Record<string, unknown> = {};
  const trends: Record<string, Record<string, [string, number, number][]>> = {};

  for (const t of TARGETS) {
    const all = [...(t.ownLocation ? [{ id: t.ownLocation, city: "magasin" }] : []), ...t.locations];
    const perLocation = new Map<number, MatchedPackage[]>();
    const monthly = new Map<string, number[]>();
    for (const loc of all) {
      const prices = await cachedPrices(loc.id, SINCE);
      // Fourchette plus stricte que l'import manuel : on mélange plusieurs magasins.
      const report = matchOpenPrices(prices, ingredients, seed.packages, `${t.storeId}-${loc.id}`, { since: SINCE, maxAbove: 1.6, maxBelow: 2 });
      const ok = report.packages
        .filter((p) => plausible(ingredients.get(p.ingredientId)!.name, p.productName, foodHeads, p.ingredientId, ingredients.get(p.ingredientId)) && consistentQuantity(p))
        .map(toDrained)
        .filter(plausibleSize);
      perLocation.set(loc.id, ok);
      // Évolution : mêmes règles, mois par mois (tous les relevés du mois, pas seulement le dernier).
      const byMonth = new Map<string, typeof prices>();
      for (const pr of prices) byMonth.set(pr.date.slice(0, 7), [...(byMonth.get(pr.date.slice(0, 7)) ?? []), pr]);
      for (const [month, monthPrices] of byMonth) {
        const r = matchOpenPrices(monthPrices, ingredients, seed.packages, "trend", { since: `${month}-01`, maxAbove: 1.6, maxBelow: 2 });
        for (const p of r.packages) {
          if (!(plausible(ingredients.get(p.ingredientId)!.name, p.productName, foodHeads, p.ingredientId, ingredients.get(p.ingredientId)) && consistentQuantity(p) && plausibleSize(toDrained(p)))) continue;
          const key = `${p.ingredientId}|${month}`;
          monthly.set(key, [...(monthly.get(key) ?? []), p.priceCents / toDrained(p).quantity]);
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
