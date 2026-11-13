/** Rapprochement produit Open Prices / ingrédient du catalogue (partagé par le script et ses diagnostics). */

/** Sans accents, minuscules, mots séparés. */
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
export const STOP = new Set(["de", "du", "des", "la", "le", "les", "en", "au", "aux", "a", "d", "l", "et", "a", "conserve", "surgele", "surgeles", "frais", "fraiche", "sec", "secs"]);
/** Racine de 5 lettres, pluriel ôté (« oeufs » = « oeuf », « pommes » = « pomme »). */
export const stem = (w: string) => (w.length > 3 ? w.replace(/[sx]$/, "") : w).slice(0, 5);
/** Mots qui signalent un plat préparé ou un autre produit (s'ils ne sont pas dans le nom de l'ingrédient). */
const DISH = new Set(["hache", "haches", "bouillon", "cubes", "gnocchi", "gnocchis", "pizza", "salade", "sandwich", "chips", "soupe", "veloute", "quiche", "tarte", "brioche", "biscuit", "biscuits", "gateau", "sauce", "plat", "cuisine", "cuisines", "emince", "emincee", "emiette", "nuggets", "pane", "panes", "croquettes", "gratin", "lasagnes", "raviolis", "ravioles", "tortellini", "girasoli", "torti", "nem", "nems", "bol", "poelee", "tartinade", "tartinades", "houmous", "taboule", "escalope", "bruschetta", "lit", "burger", "wrap", "feuillete", "aperitif", "friture", "dessert", "boisson", "jus", "creme", "yaourt", "fromage", "fourre", "fourree", "tarama", "puree", "sugo", "bio", "caramelisees", "caramelise", "aromatise", "aromatisee"]);
/** Premiers mots d'ingrédients trop génériques pour signaler un autre aliment. */
export const GENERIC_HEADS = new Set(["sauce", "pate", "pates", "huile", "lait", "pain", "pains", "poudre", "filet", "filets", "fond", "fumet", "double", "graines", "petits", "blanc", "creme", "fromage", "dos", "cuisses", "noix", "melange", "mini", "boisson", "yaourt", "sucre", "jus"]);

/**
 * Appellations courantes en rayon qui ne reprennent pas les mots du catalogue
 * (« Jambon supérieur » pour jambon blanc, « lait 1/2 écrémé » pour demi-écrémé…).
 * Testées sur le nom du produit, sans accents ni ponctuation, mots vides ôtés.
 */
export const NAME_ALIASES: Record<string, RegExp> = {
  "jambon-blanc": /^jambon (cuit|superieur|sup|de paris|blanc|sans couenne|choix)/,
  "filet-poulet": /^(filets?|blancs?|aiguillettes?|escalopes?) poulet|^poulet (filets?|blancs?|escalopes?)/,
  "lait-demi-ecreme": /^lait.*\b(1 2|demi)\b.*ecreme/,
  "mais-conserve": /^mais\b/,
  "lardons-fumes": /^lardons? (fumes?|nature)/,
  "emmental-rape": /^emmental (francais )?rape/,
};

/**
 * Le produit correspond-il vraiment à l'ingrédient ?
 * - ses deux premiers mots significatifs figurent dans le nom du produit, le premier dès le début ;
 * - aucun mot de « plat préparé » ni aucun autre aliment du catalogue étranger à l'ingrédient.
 */
export function plausible(ingredientName: string, productName: string, foodHeads: ReadonlySet<string>, ingredientId?: string): boolean {
  const ing = words(ingredientName.replace(/\(.*?\)/g, "")).filter((w) => !STOP.has(w));
  const prod = words(productName).filter((w) => !STOP.has(w));
  const prodStems = prod.map(stem);
  const ingStems = new Set(ing.map(stem));
  const alias = ingredientId ? NAME_ALIASES[ingredientId] : undefined;
  const aliased = !!alias && alias.test(prod.join(" "));
  if (!aliased) {
    if (!ing[0] || !prodStems.slice(0, 2).includes(stem(ing[0]))) return false;
    if (!ing.slice(0, 2).every((w) => prodStems.includes(stem(w)))) return false;
  }
  if (prod.some((w) => DISH.has(w) && !ingStems.has(stem(w)))) return false;
  return !prodStems.some((s) => foodHeads.has(s) && !ingStems.has(s));
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

