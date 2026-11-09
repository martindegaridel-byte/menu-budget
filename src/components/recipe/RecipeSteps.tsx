"use client";
import { BookOpenText, Lightbulb, ListChecks, Utensils, UtensilsCrossed } from "lucide-react";
import { Segmented } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { usePersistentState } from "@/lib/client/storage";

/** Choix « simple / détaillé » des instructions, mémorisé (aussi lu par le mode cuisine). */
export const STEPS_DETAIL_KEY = "mb:steps-detail";

export interface RenderedDetail {
  utensils: string[];
  prep: string[];
  steps: { text: string; tip?: string }[];
  serve?: string;
}

/** Préparation de la recette : version courte ou détaillée (ustensiles, mise en place, repères, astuces). */
export function RecipeSteps({ steps, detail }: { steps: string[]; detail: RenderedDetail | null }) {
  const [mode, setMode] = usePersistentState<"simple" | "detaille">(STEPS_DETAIL_KEY, "simple");
  const detailed = mode === "detaille" && !!detail;

  return (
    <section aria-labelledby="steps-title" className="space-y-4 rounded-card bg-surface p-4 shadow-soft ring-1 ring-inset ring-line sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="steps-title" className="text-title-3 font-semibold">
          Préparation
        </h2>
        {detail && (
          <Segmented
            label="Niveau de détail des instructions"
            value={mode}
            onChange={setMode}
            options={[
              { value: "simple", label: "Simple", icon: ListChecks },
              { value: "detaille", label: "Détaillé", icon: BookOpenText },
            ]}
          />
        )}
      </div>

      {detailed && detail.utensils.length > 0 && (
        <div>
          <h3 className="mb-1.5 inline-flex items-center gap-2 text-body-sm font-semibold">
            <UtensilsCrossed aria-hidden className="size-4 text-accent-text" strokeWidth={ICON_STROKE} /> Ustensiles
          </h3>
          <p className="text-body-sm text-muted">{detail.utensils.join(" · ")}</p>
        </div>
      )}

      {detailed && detail.prep.length > 0 && (
        <div>
          <h3 className="mb-1.5 inline-flex items-center gap-2 text-body-sm font-semibold">
            <Utensils aria-hidden className="size-4 text-accent-text" strokeWidth={ICON_STROKE} /> Mise en place
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-body-sm marker:text-subtle">
            {detail.prep.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-4">
        {(detailed ? detail.steps : steps.map((text) => ({ text, tip: undefined as string | undefined }))).map((s, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-semibold tabular-nums text-accent-text">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-body-sm leading-relaxed">{s.text}</p>
              {s.tip && (
                <p className="mt-1.5 flex gap-1.5 rounded-field bg-warn-soft px-2.5 py-1.5 text-caption text-fg">
                  <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn-text" strokeWidth={ICON_STROKE} />
                  <span>{s.tip}</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {detailed && detail.serve && (
        <p className="rounded-field bg-surface-2 p-3 text-body-sm ring-1 ring-inset ring-line">
          <span className="font-semibold">Pour servir : </span>
          {detail.serve}
        </p>
      )}
      {!detail && <p className="text-caption text-subtle">Version détaillée bientôt disponible pour cette recette.</p>}
    </section>
  );
}
