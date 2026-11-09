/** Mode cuisine à la voix : texte lisible à voix haute et commandes reconnues (« suivant », « précédent »…). */

export type VoiceCommand = "next" | "previous" | "repeat" | "timer" | "stop";

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

const PATTERNS: [VoiceCommand, RegExp][] = [
  ["stop", /\b(stop|arrete|tais toi|silence)\b/],
  ["previous", /\b(precedent|precedente|retour|recule)\b/],
  ["repeat", /\b(repete|repeter|relis|relire|redis)\b/],
  ["timer", /\b(minuteur|minuterie|chrono|lance le temps|timer)\b/],
  ["next", /\b(suivant|suivante|ensuite|continue|continuer|vas y|c est fait|termine|commencer|commence)\b/],
];

/** Dernière commande prononcée dans la phrase (on garde la fin : « non… suivant »). */
export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const words = strip(transcript).trim();
  if (!words) return null;
  let best: { cmd: VoiceCommand; at: number } | null = null;
  for (const [cmd, re] of PATTERNS) {
    const all = [...words.matchAll(new RegExp(re.source, "g"))];
    const m = all.at(-1);
    if (m && (best === null || m.index > best.at)) best = { cmd, at: m.index };
  }
  return best?.cmd ?? null;
}

const UNITS: [RegExp, string][] = [
  [/(\d)\s?min\b\.?/g, "$1 minutes"],
  [/(\d)\s?h\b/g, "$1 heures"],
  [/(\d)\s?s\b/g, "$1 secondes"],
  [/(\d)\s?°\s?C\b/g, "$1 degrés"],
  [/(\d)\s?kg\b/g, "$1 kilos"],
  [/(\d)\s?g\b/g, "$1 grammes"],
  [/(\d)\s?cl\b/g, "$1 centilitres"],
  [/(\d)\s?ml\b/g, "$1 millilitres"],
  [/(\d)\s?l\b/g, "$1 litres"],
  [/\bc\.\s?à\s?soupe\b/gi, "cuillère à soupe"],
  [/\bc\.\s?à\s?s\.?/gi, "cuillère à soupe"],
  [/\bc\.\s?à\s?c\.?/gi, "cuillère à café"],
  [/(\d+)\s?[-–à]\s?(\d+)/g, "$1 à $2"],
];

/** Texte adapté à la synthèse vocale (unités en toutes lettres). */
export function forSpeech(text: string): string {
  let s = text;
  for (const [re, rep] of UNITS) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}
