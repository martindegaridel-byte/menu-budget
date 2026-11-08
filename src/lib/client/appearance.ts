/**
 * Personnalisation de l'apparence (purement visuelle) : thème, couleur d'accent,
 * ambiance de fond, taille du texte, coins, animations, barre de navigation.
 * Stockée dans le navigateur ; appliquée sur <html> par des attributs data-*.
 */

export const APPEARANCE_KEY = "mb:appearance";
export const THEME_KEY = "mb:theme";
/**
 * Version du format enregistré. Avant la v2 (passage à « Popote »), Émeraude et Forêt étaient
 * les valeurs par défaut : enregistrées sans choix explicite, elles cèdent la place à Tomate et Fonte.
 */
export const APPEARANCE_VERSION = 2;

export const ACCENTS = {
  tomate: { label: "Tomate", swatch: "#f0603f" },
  emeraude: { label: "Émeraude", swatch: "#34d399" },
  ocean: { label: "Océan", swatch: "#38bdf8" },
  indigo: { label: "Indigo", swatch: "#818cf8" },
  violet: { label: "Violet", swatch: "#a78bfa" },
  rose: { label: "Rose", swatch: "#f472b6" },
  corail: { label: "Corail", swatch: "#fb7185" },
  orange: { label: "Orange", swatch: "#fb923c" },
  ambre: { label: "Ambre", swatch: "#fbbf24" },
  citron: { label: "Citron vert", swatch: "#a3e635" },
  turquoise: { label: "Turquoise", swatch: "#2dd4bf" },
  ardoise: { label: "Ardoise", swatch: "#94a3b8" },
} as const;
export type Accent = keyof typeof ACCENTS;

/** Ambiances de fond : [sombre, clair] pour l'aperçu. */
export const SURFACES = {
  fonte: { label: "Fonte", dark: ["#15110f", "#27211d"], light: ["#f6efe3", "#f1e8da"] },
  foret: { label: "Forêt", dark: ["#0b0f0e", "#1a2321"], light: ["#f5f8f6", "#eef3f0"] },
  nuit: { label: "Nuit", dark: ["#09090b", "#1c1c1f"], light: ["#f4f4f5", "#ececee"] },
  ardoise: { label: "Bleu nuit", dark: ["#0b1020", "#1a2338"], light: ["#f1f5f9", "#e8eef5"] },
  prune: { label: "Prune", dark: ["#120b14", "#251a2a"], light: ["#faf5fb", "#f2e8f4"] },
  moka: { label: "Moka", dark: ["#120e0b", "#251e18"], light: ["#faf6f0", "#f3ece2"] },
} as const;
export type Surface = keyof typeof SURFACES;

export type ThemePref = "dark" | "light" | "auto";
export type TextSize = "normal" | "grand" | "tres-grand";
export type Corners = "doux" | "arrondi" | "net";

export interface Appearance {
  theme: ThemePref;
  accent: Accent;
  surface: Surface;
  text: TextSize;
  corners: Corners;
  reduceMotion: boolean;
  /** Entrées masquées de la barre de navigation mobile (href). */
  hiddenNav: string[];
  /** Afficher les libellés sous les icônes de la barre de navigation. */
  navLabels: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "tomate",
  surface: "fonte",
  text: "normal",
  corners: "doux",
  reduceMotion: false,
  hiddenNav: ["/magasins"],
  navLabels: true,
};

export const TEXT_SCALE: Record<TextSize, string> = { normal: "100%", grand: "112.5%", "tres-grand": "125%" };

/** Lit l'apparence enregistrée (valeurs inconnues ignorées). */
export function loadAppearance(): Appearance {
  const a: Appearance = { ...DEFAULT_APPEARANCE };
  try {
    const raw = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") as Partial<Appearance> & { v?: number };
    if ((raw.v ?? 1) < APPEARANCE_VERSION) {
      if (raw.accent === "emeraude") delete raw.accent;
      if (raw.surface === "foret") delete raw.surface;
    }
    if (raw.accent && raw.accent in ACCENTS) a.accent = raw.accent;
    if (raw.surface && raw.surface in SURFACES) a.surface = raw.surface;
    if (raw.text && raw.text in TEXT_SCALE) a.text = raw.text;
    if (raw.corners === "doux" || raw.corners === "arrondi" || raw.corners === "net") a.corners = raw.corners;
    if (typeof raw.reduceMotion === "boolean") a.reduceMotion = raw.reduceMotion;
    if (Array.isArray(raw.hiddenNav)) a.hiddenNav = raw.hiddenNav.filter((h): h is string => typeof h === "string");
    if (typeof raw.navLabels === "boolean") a.navLabels = raw.navLabels;
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark" || t === "auto") a.theme = t;
  } catch {
    /* stockage indisponible : valeurs par défaut */
  }
  return a;
}

export function resolveTheme(t: ThemePref): "dark" | "light" {
  if (t !== "auto") return t;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Applique l'apparence sur <html> (attributs data-*, taille de police). */
export function applyAppearance(a: Appearance) {
  const el = document.documentElement;
  el.dataset.theme = resolveTheme(a.theme);
  el.dataset.accent = a.accent;
  el.dataset.surface = a.surface;
  el.dataset.corners = a.corners;
  el.dataset.motion = a.reduceMotion ? "reduce" : "auto";
  el.style.fontSize = TEXT_SCALE[a.text];
}

export const APPEARANCE_EVENT = "mb:appearance-change";

export function saveAppearance(a: Appearance) {
  try {
    const { theme, ...rest } = a;
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...rest, v: APPEARANCE_VERSION }));
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* stockage indisponible : vaut pour la session */
  }
  applyAppearance(a);
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT));
}

/** Script exécuté dans <head>, avant l'affichage, pour éviter un éclair de mauvaise apparence. */
export const APPEARANCE_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("${THEME_KEY}");if(t==="auto")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.dataset.theme=t==="light"?"light":"dark";var a=JSON.parse(localStorage.getItem("${APPEARANCE_KEY}")||"{}");if((a.v||1)<${APPEARANCE_VERSION}){if(a.accent==="emeraude")delete a.accent;if(a.surface==="foret")delete a.surface}if(a.accent)d.dataset.accent=a.accent;if(a.surface)d.dataset.surface=a.surface;if(a.corners)d.dataset.corners=a.corners;if(a.reduceMotion)d.dataset.motion="reduce";var s={grand:"112.5%","tres-grand":"125%"}[a.text];if(s)d.style.fontSize=s}catch(e){d.dataset.theme="dark"}})();`;
