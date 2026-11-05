/** Concatène des classes en ignorant les valeurs vides. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Épaisseur de trait des icônes lucide dans toute l'appli. */
export const ICON_STROKE = 1.75;
