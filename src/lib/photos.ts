import photos from "../../data/recipe-photos.json";

/** Photo d'un plat (Wikimedia Commons, licence libre) et son crédit, à afficher avec la photo. */
export interface RecipePhoto {
  src: string;
  author: string;
  license: string;
  /** Page de la photo sur Wikimedia Commons. */
  page: string;
}

const PHOTOS = photos as Record<string, { author: string; license: string; page: string }>;

export function recipePhoto(recipeId: string): RecipePhoto | null {
  const p = PHOTOS[recipeId];
  return p ? { src: `/photos/${recipeId}.webp`, ...p } : null;
}
