"use client";
import { Check, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { IconButton, useToast } from "@/components/ds";
import { api } from "@/lib/client/api";
import { eurosToCents, formatEuros } from "@/lib/engine/money";
import type { ShoppingLine } from "@/lib/engine/types";

/**
 * « Prix payé » : corrige le prix d'un article de la liste avec celui du ticket. Il est enregistré
 * comme votre prix pour ce magasin (même contenance) et sert aux menus suivants.
 */
export function PaidPrice({ line, storeId, storeName, onSaved }: { line: ShoppingLine; storeId: string; storeName?: string; onSaved?: () => void }) {
  const pick = line.picks[0];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const inputId = useId();
  if (!pick?.quantity) return null;

  const start = () => {
    setValue((pick.unitPriceCents / 100).toFixed(2).replace(".", ","));
    setOpen(true);
  };
  const save = async () => {
    let cents: number;
    try {
      cents = eurosToCents(value);
    } catch {
      toast({ title: "Montant invalide", description: "Exemple : 1,29", tone: "error" });
      return;
    }
    if (cents <= 0 || cents > 50_000) {
      toast({ title: "Montant invalide", description: "Entre 0,01 € et 500 €.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await api.setPrice({ storeId, ingredientId: line.ingredientId, label: pick.label, quantity: pick.quantity!, priceCents: cents });
      toast({ title: `Prix enregistré : ${formatEuros(cents)}`, description: `${pick.label} chez ${storeName ?? "votre magasin"}. Le menu est recalculé.`, tone: "success" });
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <IconButton icon={Tag} label={`Saisir le prix payé pour ${line.name}`} onClick={start} />;
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="mb-1 block text-caption text-muted">
          Prix payé pour 1 × {pick.label} (€)
        </label>
        <input id={inputId} className="input w-full tabular-nums" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <IconButton icon={Check} label="Enregistrer le prix payé" type="submit" disabled={busy} />
      <IconButton icon={X} label="Annuler" onClick={() => setOpen(false)} />
    </form>
  );
}
