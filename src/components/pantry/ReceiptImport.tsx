"use client";
import { ClipboardPaste, PackagePlus, ReceiptText, ScanText } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Badge, Button, CollapsibleCard } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { formatEuros } from "@/lib/engine/money";
import { parseReceipt, type ReceiptLine } from "@/lib/pricing/receipt";

const UNIT = { g: "g", ml: "ml", piece: "pièce(s)" } as const;

/** Import d'un ticket de caisse collé en texte : on montre ce qui a été compris avant d'ajouter. */
export function ReceiptImport({ ingredients, onAdd }: { ingredients: IngredientOption[]; onAdd: (items: { ingredientId: string; quantity: number | null }[]) => void }) {
  const [text, setText] = useState("");
  const [lines, setLines] = useState<(ReceiptLine & { keep: boolean })[] | null>(null);
  const textId = useId();
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const sorted = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, "fr")), [ingredients]);

  const analyse = () => setLines(parseReceipt(text, ingredients).map((l) => ({ ...l, keep: !!l.ingredientId })));
  const patch = (i: number, p: Partial<ReceiptLine & { keep: boolean }>) => setLines((ls) => ls!.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const kept = lines?.filter((l) => l.keep && l.ingredientId) ?? [];

  return (
    <CollapsibleCard icon={ReceiptText} title="Importer un ticket de caisse" summary="Collez le texte du ticket : on ajoute vos achats au placard.">
      <div className="space-y-3">
        <p className="text-body-sm text-muted">
          Sur votre téléphone, ouvrez la photo du ticket, sélectionnez le texte (« Copier le texte » sur iPhone, Google Lens sur Android) puis collez-le ici. Le
          ticket dématérialisé de votre magasin fonctionne aussi.
        </p>
        <label htmlFor={textId} className="sr-only">
          Texte du ticket
        </label>
        <textarea
          id={textId}
          className="input min-h-36 py-2 font-mono text-body-sm"
          placeholder={"PATES PENNE 500G        0,85\n2 X LAIT DEMI ECREME 1L 1,90\nOEUFS PLEIN AIR X12     3,69"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button icon={ScanText} onClick={analyse} disabled={!text.trim()}>
            Analyser le ticket
          </Button>
          {typeof navigator !== "undefined" && navigator.clipboard && (
            <Button
              variant="secondary"
              icon={ClipboardPaste}
              onClick={async () => {
                try {
                  setText(await navigator.clipboard.readText());
                } catch {
                  /* collage refusé par le navigateur */
                }
              }}
            >
              Coller
            </Button>
          )}
        </div>

        {lines && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-body-sm">
              <span className="font-semibold">{lines.filter((l) => l.ingredientId).length}</span> article(s) reconnu(s) sur {lines.length}. Vérifiez avant d&apos;ajouter.
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-field ring-1 ring-inset ring-line">
              {lines.map((l, i) => {
                const ing = l.ingredientId ? byId.get(l.ingredientId) : undefined;
                return (
                  <li key={i} className={cn("space-y-2 bg-surface p-3", !l.keep && "opacity-60")}>
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex min-h-11 flex-1 cursor-pointer items-start gap-3">
                        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--mb-accent-2)]" checked={l.keep} disabled={!l.ingredientId} onChange={(e) => patch(i, { keep: e.target.checked })} />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-caption text-subtle">{l.raw}</span>
                          {!l.ingredientId && <span className="text-caption text-warn-text">Non reconnu : choisissez l&apos;ingrédient ou ignorez la ligne.</span>}
                        </span>
                      </label>
                      {l.priceCents !== null && <span className="font-numeric text-body-sm tabular-nums text-muted">{formatEuros(l.priceCents)}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-8">
                      <label className="sr-only" htmlFor={`rc-ing-${i}`}>
                        Ingrédient pour « {l.label} »
                      </label>
                      <select
                        id={`rc-ing-${i}`}
                        className="input h-11 min-w-0 flex-1 py-0 text-body-sm"
                        value={l.ingredientId ?? ""}
                        onChange={(e) => {
                          const next = byId.get(e.target.value);
                          patch(i, { ingredientId: next?.id ?? null, keep: !!next, quantity: next ? (next.staple ? null : (l.quantity ?? (next.unit === "piece" ? 1 : 500))) : null });
                        }}
                      >
                        <option value="">— Ignorer cette ligne —</option>
                        {l.alternatives.length > 0 && (
                          <optgroup label="Suggestions">
                            {l.alternatives.map((id) => (
                              <option key={id} value={id}>
                                {byId.get(id)?.name ?? id}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Tous les ingrédients">
                          {sorted.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {ing && !ing.staple && (
                        <span className="inline-flex items-center gap-1">
                          <label className="sr-only" htmlFor={`rc-qty-${i}`}>
                            Quantité ({UNIT[ing.unit]})
                          </label>
                          <input
                            id={`rc-qty-${i}`}
                            inputMode="numeric"
                            className="input h-11 w-24 py-0 text-right text-body-sm tabular-nums"
                            value={l.quantity ?? ""}
                            onChange={(e) => patch(i, { quantity: e.target.value === "" ? null : Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })}
                          />
                          <span className="text-caption text-subtle">{UNIT[ing.unit]}</span>
                        </span>
                      )}
                      {ing?.staple && <Badge>en stock</Badge>}
                      {ing && !ing.staple && !l.quantityFromTicket && <Badge tone="warn">quantité à vérifier</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              icon={PackagePlus}
              fullWidth
              disabled={kept.length === 0}
              onClick={() => {
                onAdd(kept.map((l) => ({ ingredientId: l.ingredientId!, quantity: l.quantity })));
                setLines(null);
                setText("");
              }}
            >
              Ajouter {kept.length} article{kept.length > 1 ? "s" : ""} au placard
            </Button>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
