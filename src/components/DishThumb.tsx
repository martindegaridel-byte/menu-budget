"use client";
import { CakeSlice, Coffee, Egg, Fish, Leaf, Salad, Soup, UtensilsCrossed, Wheat, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ds/cn";
import { recipePhoto } from "@/lib/photos";
import { useUserPhoto } from "@/lib/client/userPhotos";

/** Icône + teinte selon les étiquettes, quand le plat n'a pas de photo. */
function dishVisual(tags: readonly string[]): { icon: LucideIcon; tint: string } {
  const t = new Set(tags);
  if (t.has("dessert")) return { icon: CakeSlice, tint: "bg-rose-500/15 text-rose-500" };
  if (t.has("petit-dejeuner")) return { icon: Coffee, tint: "bg-amber-500/15 text-amber-600" };
  if (t.has("poisson") || t.has("fruits-de-mer")) return { icon: Fish, tint: "bg-sky-500/15 text-sky-500" };
  if (t.has("soupe")) return { icon: Soup, tint: "bg-orange-500/15 text-orange-500" };
  if (t.has("vegan")) return { icon: Leaf, tint: "bg-emerald-500/15 text-emerald-500" };
  if (t.has("oeufs")) return { icon: Egg, tint: "bg-yellow-500/15 text-yellow-500" };
  if (t.has("vegetarien")) return { icon: Salad, tint: "bg-lime-500/15 text-lime-600" };
  if (t.has("pates") || t.has("riz")) return { icon: Wheat, tint: "bg-amber-500/15 text-amber-500" };
  return { icon: UtensilsCrossed, tint: "bg-accent/15 text-accent-text" };
}

/** Vignette d'un plat : sa photo, sinon une icône. Décorative (le nom du plat est affiché à côté). */
export function DishThumb({ recipeId, tags = [], className, iconClassName = "size-9" }: { recipeId: string; tags?: readonly string[]; className?: string; iconClassName?: string }) {
  const mine = useUserPhoto(recipeId);
  const stock = recipePhoto(recipeId);
  const photo = mine ? { src: mine } : stock;
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- photos déjà redimensionnées (WebP 640×480)
      <img
        src={photo.src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-field bg-surface-2 object-cover ring-1 ring-inset ring-line", className)}
      />
    );
  }
  const { icon: Icon, tint } = dishVisual(tags);
  return (
    <div aria-hidden className={cn("grid shrink-0 place-items-center rounded-field ring-1 ring-inset ring-line", tint, className)}>
      <Icon className={iconClassName} strokeWidth={1.5} />
    </div>
  );
}
