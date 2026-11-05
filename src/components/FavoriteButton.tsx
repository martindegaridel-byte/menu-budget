"use client";
import { Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { api } from "@/lib/client/api";

export function FavoriteButton({ recipeId, initial }: { recipeId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={Star}
      aria-pressed={on}
      className={cn("shrink-0", on && "text-warn [&_svg]:fill-warn")}
      onClick={async () => {
        setOn(!on);
        try {
          await api.setFavorite(recipeId, !on);
        } catch {
          setOn(on);
        }
      }}
    >
      {on ? "Favori" : "Favori ?"}
    </Button>
  );
}
