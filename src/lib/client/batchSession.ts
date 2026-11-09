/**
 * Session de batch cooking guidée : enchaîne toutes les recettes de la session dans un ordre
 * pratique — mise en place commune, four préchauffé une fois, bases cuites ensemble, cuissons
 * longues lancées d'abord — avec des rappels « pendant ce temps, passez au plat suivant ».
 */
export interface SessionDish {
  name: string;
  /** Mise en place de la recette (version détaillée), sinon vide. */
  prep: string[];
  steps: string[];
  cookMinutes: number;
  /** Nombre de repas couverts par ce plat. */
  meals: number;
}

export interface SessionBase {
  /** « Cuire 600 g de riz » */
  text: string;
  /** Plats qui l'utilisent. */
  dishNames: string[];
}

/** Températures de four mentionnées dans les étapes (« 180 °C »), sans doublon, de la plus chaude à la plus douce. */
export function ovenTemperatures(dishes: readonly SessionDish[]): number[] {
  const temps = new Set<number>();
  for (const d of dishes) for (const s of [...d.prep, ...d.steps]) for (const m of s.matchAll(/(\d{3})\s?°\s?C/g)) temps.add(Number(m[1]));
  return [...temps].sort((a, b) => b - a);
}

/** Une étape avec une attente d'au moins 10 min (cuisson, mijotage) libère les mains. */
export function freesHands(step: string): boolean {
  return [...step.matchAll(/(\d+)\s?(?:min|minutes)\b/g)].some((m) => Number(m[1]) >= 10) || /\b(\d+)\s?h\b/.test(step);
}

export function buildSessionSteps(dishes: readonly SessionDish[], bases: readonly SessionBase[], storage: string): string[] {
  const ordered = [...dishes].sort((a, b) => b.cookMinutes - a.cookMinutes);
  const out: string[] = [];
  const temps = ovenTemperatures(ordered);
  const setup = [
    temps.length ? `Préchauffer le four à ${temps[0]} °C${temps.length > 1 ? ` (vous baisserez ensuite pour les plats à ${temps.slice(1).join(" °C, ")} °C)` : ""}.` : "",
    "Sortir les boîtes de conservation et les étiquettes.",
    ...ordered.flatMap((d) => d.prep.filter((p) => !/préchauffer/i.test(p)).map((p) => `${d.name} : ${p}`)),
  ].filter(Boolean);
  out.push(`Mise en place de toute la session\n\n• ${setup.join("\n• ")}`);
  for (const b of bases) out.push(`Bases communes — ${b.text}\n\nPour : ${b.dishNames.join(", ")}. Dans ces recettes, sautez ensuite l'étape de cuisson de cette base.`);
  ordered.forEach((d, k) => {
    const next = ordered[k + 1];
    d.steps.forEach((s, i) => {
      const hint = next && freesHands(s) ? `\n\nPendant ce temps : commencez « ${next.name} ».` : "";
      out.push(`${d.name}${d.meals > 1 ? ` (${d.meals} repas)` : ""} — étape ${i + 1}/${d.steps.length}\n\n${s}${hint}`);
    });
  });
  out.push(`Rangement\n\n${storage}`);
  return out;
}
