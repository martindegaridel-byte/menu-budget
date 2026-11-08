"use client";
import { ChefHat, Star } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, Card, CardHeader } from "@/components/ds";
import { CookMode } from "./CookMode";
import { RecipeRating } from "./RecipeRating";

/** Page recette : bouton « Mode cuisine » et votre avis (note, commentaire). */
export function RecipeActions({
  recipeId,
  recipeName,
  persons,
  ingredients,
  steps,
  initialStars,
  initialNote,
}: {
  recipeId: string;
  recipeName: string;
  persons: number;
  ingredients: { id: string; name: string; quantity: string; optional: boolean }[];
  steps: string[];
  initialStars: number | null;
  initialNote: string;
}) {
  const [cooking, setCooking] = useState(false);
  const [rating, setRating] = useState({ stars: initialStars, note: initialNote });
  const close = useCallback(() => setCooking(false), []);
  const ratingWidget = (
    <RecipeRating recipeId={recipeId} stars={rating.stars} note={rating.note} onChange={(stars, note) => setRating({ stars, note })} />
  );

  return (
    <>
      <Button size="lg" fullWidth icon={ChefHat} onClick={() => setCooking(true)}>
        Mode cuisine pas à pas
      </Button>
      {cooking && <CookMode recipeName={recipeName} persons={persons} ingredients={ingredients} steps={steps} onClose={close} endSlot={ratingWidget} />}
      <Card>
        <CardHeader icon={Star} title="Votre avis" description="Vos notes orientent vos prochains menus : ce que vous aimez revient plus souvent." />
        {ratingWidget}
      </Card>
    </>
  );
}
