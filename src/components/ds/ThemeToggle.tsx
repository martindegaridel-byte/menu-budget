"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "./Button";

export const THEME_KEY = "mb:theme";
export type Theme = "dark" | "light";

/** Script exécuté avant l'affichage (dans <head>) pour éviter un éclair de mauvais thème. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      className={className}
      variant="ghost"
      icon={theme === "dark" ? Sun : Moon}
      label={next === "light" ? "Passer au thème clair" : "Passer au thème sombre"}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* stockage indisponible : le thème vaut pour la session */
        }
        setTheme(next);
      }}
    />
  );
}
