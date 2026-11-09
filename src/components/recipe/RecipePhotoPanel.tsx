"use client";
import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, useToast } from "@/components/ds";
import { resizePhoto, setUserPhoto, useUserPhoto } from "@/lib/client/userPhotos";
import type { RecipePhoto } from "@/lib/photos";

/** Photo du plat : la vôtre si vous l'avez prise, sinon la photo d'illustration (avec son crédit). */
export function RecipePhotoPanel({ recipeId, recipeName, stock }: { recipeId: string; recipeName: string; stock: RecipePhoto | null }) {
  const mine = useUserPhoto(recipeId);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await resizePhoto(file);
      const res = await fetch(`/api/photos/${encodeURIComponent(recipeId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = (await res.json()) as { version?: number; error?: string };
      if (!res.ok || !data.version) throw new Error(data.error ?? "Envoi impossible");
      setUserPhoto(recipeId, data.version);
      toast({ title: "Votre photo remplace l'illustration", tone: "success" });
    } catch (e) {
      toast({ title: "Photo non enregistrée", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetch(`/api/photos/${encodeURIComponent(recipeId)}`, { method: "DELETE" });
      setUserPhoto(recipeId, null);
    } finally {
      setBusy(false);
    }
  };

  const src = mine ?? stock?.src ?? null;
  return (
    <figure className="-mx-4 sm:mx-0">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- photo déjà redimensionnée
        <img src={src} alt={mine ? `Votre photo : ${recipeName}` : `Photo d'illustration : ${recipeName}`} className="aspect-[4/3] w-full bg-surface-2 object-cover sm:rounded-card" />
      )}
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-0">
        <span className="text-[11px] text-subtle">
          {mine ? (
            "Votre photo"
          ) : stock ? (
            <>
              Photo d&apos;illustration :{" "}
              <a href={stock.page} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-muted">
                {stock.author}
              </a>
              , {stock.license}, via Wikimedia Commons
            </>
          ) : (
            "Pas encore de photo pour ce plat."
          )}
        </span>
        <span className="flex gap-1">
          <label className="sr-only" htmlFor={`photo-${recipeId}`}>
            Photographier votre plat
          </label>
          <input
            id={`photo-${recipeId}`}
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button variant="ghost" size="sm" icon={Camera} loading={busy} onClick={() => input.current?.click()}>
            {mine ? "Changer ma photo" : "Ma photo"}
          </Button>
          {mine && (
            <Button variant="ghost" size="sm" icon={Trash2} disabled={busy} onClick={() => void remove()} aria-label="Retirer ma photo">
              Retirer
            </Button>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
