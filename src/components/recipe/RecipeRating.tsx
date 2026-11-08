"use client";
import { Star } from "lucide-react";
import { useId, useState } from "react";
import { Button, useToast } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { api } from "@/lib/client/api";

const LABELS = ["", "Pas aimé", "Bof", "Correct", "Bon", "Excellent"];

/** Note (1 à 5 étoiles) et commentaire personnel ; le moteur en tient compte pour vos menus. */
export function RecipeRating({
  recipeId,
  stars,
  note,
  onChange,
}: {
  recipeId: string;
  stars: number | null;
  note: string;
  onChange: (stars: number | null, note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const noteId = useId();
  const groupId = useId();

  const save = async (nextStars: number | null, nextNote = draft) => {
    setSaving(true);
    try {
      await api.rateRecipe(recipeId, nextStars, nextNote);
      onChange(nextStars, nextNote);
      toast({
        title: nextStars === null ? "Note retirée" : `Noté ${nextStars} / 5 — ${LABELS[nextStars]}`,
        description: nextStars === null ? undefined : nextStars >= 4 ? "Elle reviendra plus souvent dans vos menus." : nextStars <= 2 ? "Elle sera rarement proposée." : undefined,
        tone: "success",
      });
    } catch {
      toast({ title: "Impossible d'enregistrer la note", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p id={groupId} className="mb-2 text-caption font-medium text-muted">
          Votre note {stars ? `· ${LABELS[stars]}` : ""}
        </p>
        <div role="radiogroup" aria-labelledby={groupId} className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = stars !== null && n <= stars;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} étoile${n > 1 ? "s" : ""} : ${LABELS[n]}`}
                disabled={saving}
                onClick={() => void save(stars === n ? null : n)}
                className="focus-ring grid size-12 place-items-center rounded-full transition-transform duration-150 hover:bg-surface-2 active:scale-90"
              >
                <Star aria-hidden className={cn("size-8", on ? "fill-warn text-warn" : "text-subtle")} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label htmlFor={noteId} className="mb-2 block text-caption font-medium text-muted">
          Votre commentaire (facultatif)
        </label>
        <textarea
          id={noteId}
          className="input min-h-20 py-2 text-body-sm"
          maxLength={500}
          placeholder="Ex. un peu trop salé, doubler l'ail, parfait avec du riz…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft !== note && (
          <Button size="sm" className="mt-2" loading={saving} onClick={() => void save(stars, draft)} disabled={!stars && !draft.trim()}>
            Enregistrer le commentaire
          </Button>
        )}
        {draft !== note && !stars && <p className="mt-1 text-caption text-subtle">Donnez aussi une note pour enregistrer le commentaire.</p>}
      </div>
    </div>
  );
}
