"use client";
import { useEffect, useState } from "react";
import { APPEARANCE_EVENT, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, type Appearance } from "./appearance";

/** Apparence courante, mise à jour quand elle change (page Personnaliser, bouton thème). */
export function useAppearance(): [Appearance, (a: Appearance) => void] {
  const [a, setA] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => {
    const sync = () => setA(loadAppearance());
    sync();
    window.addEventListener(APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(APPEARANCE_EVENT, sync);
  }, []);
  return [
    a,
    (next) => {
      setA(next);
      saveAppearance(next);
    },
  ];
}
