"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "./ui";

export function FavoriteButton({ recipeId, initial }: { recipeId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={on}
      onClick={async () => {
        setOn(!on);
        try {
          await api.setFavorite(recipeId, !on);
        } catch {
          setOn(on);
        }
      }}
    >
      {on ? "★ Favori" : "☆ Ajouter aux favoris"}
    </Button>
  );
}
