"use client";
import { useEffect, useState } from "react";

/** Vos photos de plats (recette → version), chargées une fois puis tenues à jour. */
let cache: Map<string, number> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function load() {
  if (cache || loading) return loading ?? undefined;
  loading = fetch("/api/photos")
    .then((r) => (r.ok ? r.json() : { photos: [] }))
    .then((d: { photos: { recipeId: string; version: number }[] }) => {
      cache = new Map(d.photos.map((p) => [p.recipeId, p.version]));
      notify();
    })
    .catch(() => {
      cache = new Map();
    });
  return loading;
}

export function setUserPhoto(recipeId: string, version: number | null) {
  cache ??= new Map();
  if (version === null) cache.delete(recipeId);
  else cache.set(recipeId, version);
  notify();
}

/** URL de votre photo du plat, ou null. */
export function useUserPhoto(recipeId: string): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const v = cache?.get(recipeId);
  return v ? `/api/photos/${encodeURIComponent(recipeId)}?v=${v}` : null;
}

/** Réduit une photo (côté plus long ≤ `maxSide`) et la convertit en JPEG, pour un envoi léger. */
export async function resizePhoto(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
