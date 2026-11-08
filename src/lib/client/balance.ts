/**
 * Équilibre de la semaine : repères simples inspirés des recommandations françaises (PNNS) :
 * légumes à chaque repas, poisson et légumineuses deux fois par semaine, viande rouge avec modération.
 */
export interface BalanceDish {
  protein: string | null;
  vegGrams: number;
}

export interface BalanceTip {
  tone: "good" | "warn";
  text: string;
}

export interface WeekBalance {
  meals: number;
  /** Portions de légumes (80 g) par repas, en moyenne. */
  vegPortionsPerMeal: number;
  fish: number;
  legumes: number;
  redMeat: number;
  vegetarian: number;
  tips: BalanceTip[];
}

export const VEG_PORTION_GRAMS = 80;
const RED_MEAT = new Set(["boeuf", "porc", "agneau", "veau"]);
const FISH = new Set(["poisson", "fruits-de-mer"]);
const MEAT = new Set([...RED_MEAT, "volaille"]);

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export function weekBalance(dishes: readonly BalanceDish[]): WeekBalance {
  const meals = dishes.length;
  const count = (set: ReadonlySet<string>) => dishes.filter((d) => d.protein !== null && set.has(d.protein)).length;
  const fish = count(FISH);
  const legumes = dishes.filter((d) => d.protein === "legumineuses").length;
  const redMeat = count(RED_MEAT);
  const vegetarian = dishes.filter((d) => !d.protein || !(MEAT.has(d.protein) || FISH.has(d.protein))).length;
  const vegPortionsPerMeal = meals ? Math.round((dishes.reduce((s, d) => s + d.vegGrams, 0) / meals / VEG_PORTION_GRAMS) * 10) / 10 : 0;

  // Repères ramenés à la longueur du menu (2 par semaine de 7 dîners → 1 pour 4 repas).
  const target = (perWeek: number) => Math.max(1, Math.round((perWeek * meals) / 7));
  const tips: BalanceTip[] = [];
  if (meals === 0) return { meals, vegPortionsPerMeal, fish, legumes, redMeat, vegetarian, tips };

  if (vegPortionsPerMeal >= 1.5) tips.push({ tone: "good", text: "Bien pourvu en légumes." });
  else tips.push({ tone: "warn", text: "Peu de légumes : ajoutez une salade, une soupe ou des crudités en accompagnement." });

  const fishTarget = target(2);
  if (meals >= 3) {
    if (fish >= fishTarget) tips.push({ tone: "good", text: `Poisson ${fish >= 2 ? "deux fois ou plus" : "au menu"} : parfait.` });
    else tips.push({ tone: "warn", text: `${fish ? plural(fish, "repas") : "Aucun repas"} de poisson : on en recommande ${fishTarget} sur ${plural(meals, "repas")}.` });
    if (legumes >= fishTarget) tips.push({ tone: "good", text: "Légumineuses présentes : fibres et protéines à petit prix." });
    else tips.push({ tone: "warn", text: "Pensez aux lentilles, pois chiches ou haricots : économiques et rassasiants." });
  }
  const redCap = Math.max(1, Math.round((3 * meals) / 7));
  if (redMeat > redCap) tips.push({ tone: "warn", text: `${plural(redMeat, "repas")} de viande rouge ou de porc : un peu beaucoup, remplacez-en un par de la volaille ou un plat végétarien.` });

  return { meals, vegPortionsPerMeal, fish, legumes, redMeat, vegetarian, tips };
}
