import type { AnimalOrigin, Diet } from "@/lib/domain/schemas";

const FORBIDDEN: Record<Diet, readonly AnimalOrigin[]> = {
  omnivore: [],
  flexitarien: [],
  pescetarien: ["viande"],
  vegetarien: ["viande", "poisson", "fruits-de-mer"],
  vegan: ["viande", "poisson", "fruits-de-mer", "oeuf", "laitier", "miel"],
};

/** Un ingrédient d'origine `animal` est-il compatible avec le régime ? */
export function isOriginAllowed(diet: Diet, animal: AnimalOrigin | null): boolean {
  return animal === null || !FORBIDDEN[diet].includes(animal);
}

/** Régimes les plus stricts compatibles avec un ensemble d'origines animales. */
export function compatibleDiets(origins: Iterable<AnimalOrigin | null>): Diet[] {
  const list = [...origins];
  return (Object.keys(FORBIDDEN) as Diet[]).filter((d) => list.every((o) => isOriginAllowed(d, o)));
}
