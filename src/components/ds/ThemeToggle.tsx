"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCE_INIT_SCRIPT, loadAppearance, saveAppearance, THEME_KEY } from "@/lib/client/appearance";
import { IconButton } from "./Button";

export { THEME_KEY };
export type Theme = "dark" | "light";

/** Script exécuté avant l'affichage (dans <head>) : thème et personnalisation. */
export const THEME_INIT_SCRIPT = APPEARANCE_INIT_SCRIPT;

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    window.addEventListener(APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(APPEARANCE_EVENT, sync);
  }, []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      className={className}
      variant="ghost"
      icon={theme === "dark" ? Sun : Moon}
      label={next === "light" ? "Passer au thème clair" : "Passer au thème sombre"}
      onClick={() => {
        saveAppearance({ ...loadAppearance(), theme: next });
        setTheme(next);
      }}
    />
  );
}
