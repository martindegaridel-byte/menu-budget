/**
 * Repère les durées citées dans une étape de recette (« cuire 12 min », « 4 à 5 min »,
 * « 1 h », « 30 secondes ») pour proposer des minuteurs en un geste.
 */
export interface StepTimer {
  /** Texte trouvé dans l'étape (ex. « 4 à 5 min »). */
  label: string;
  /** Durée retenue, en secondes (la plus longue pour une fourchette). */
  seconds: number;
}

const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*(?:à|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(h(?:eures?)?|min(?:utes?)?|s(?:ec(?:ondes?)?)?)(?![a-zà-ÿ])/gi;

const UNIT_SECONDS = (u: string) => (u.startsWith("h") ? 3600 : u.startsWith("m") ? 60 : 1);

export function findTimers(step: string): StepTimer[] {
  const out: StepTimer[] = [];
  for (const m of step.matchAll(DURATION)) {
    const unit = m[3]!.toLowerCase();
    // « 2 h » oui ; mais pas une heure de four (« 180 °C ») ni une quantité.
    const value = Math.max(Number(m[1]!.replace(",", ".")), m[2] ? Number(m[2].replace(",", ".")) : 0);
    const seconds = Math.round(value * UNIT_SECONDS(unit));
    if (seconds < 10 || seconds > 6 * 3600) continue;
    if (!out.some((t) => t.seconds === seconds)) out.push({ label: m[0].trim(), seconds });
  }
  return out;
}

/** « 12:05 » ou « 1:02:30 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
