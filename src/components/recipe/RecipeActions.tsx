"use client";
import { ChefHat, Star } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, Card, CardHeader } from "@/components/ds";
import { CookMode } from "./CookMode";
import { STEPS_DETAIL_KEY, type RenderedDetail } from "./RecipeSteps";
import { RecipeRating } from "./RecipeRating";

/** Page recette : bouton « Mode cuisine » et votre avis (note, commentaire). */
export function RecipeActions({
  recipeId,
  recipeName,
  persons,
  ingredients,
  steps,
  detail = null,
  initialStars,
  initialNote,
}: {
  recipeId: string;
  recipeName: string;
  persons: number;
  ingredients: { id: string; name: string; quantity: string; optional: boolean }[];
  steps: string[];
  /** Version détaillée (si elle existe) : utilisée en mode cuisine quand « Détaillé » est choisi. */
  detail?: RenderedDetail | null;
  initialStars: number | null;
  initialNote: string;
}) {
  const [cooking, setCooking] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const start = () => {
    let wantDetail = false;
    try {
      wantDetail = JSON.parse(localStorage.getItem(STEPS_DETAIL_KEY) ?? "null") === "detaille";
    } catch {
      /* stockage indisponible */
    }
    setDetailed(wantDetail && !!detail);
    setCooking(true);
  };
  const cookSteps =
    detailed && detail
      ? [
          ...(detail.prep.length ? [`Mise en place : ${detail.prep.join(" · ")}`] : []),
          ...detail.steps.map((s) => (s.tip ? `${s.text}\n\nAstuce : ${s.tip}` : s.text)),
          ...(detail.serve ? [`Pour servir : ${detail.serve}`] : []),
        ]
      : steps;
  const [rating, setRating] = useState({ stars: initialStars, note: initialNote });
  const close = useCallback(() => setCooking(false), []);
  const ratingWidget = (
    <RecipeRating recipeId={recipeId} stars={rating.stars} note={rating.note} onChange={(stars, note) => setRating({ stars, note })} />
  );

  return (
    <>
      <Button size="lg" fullWidth icon={ChefHat} onClick={start}>
        Mode cuisine pas à pas
      </Button>
      {cooking && <CookMode recipeName={recipeName} persons={persons} ingredients={ingredients} steps={cookSteps} onClose={close} endSlot={ratingWidget} />}
      <Card>
        <CardHeader icon={Star} title="Votre avis" description="Vos notes orientent vos prochains menus : ce que vous aimez revient plus souvent." />
        {ratingWidget}
      </Card>
    </>
  );
}
