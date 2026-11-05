"use client";
import { HeartPulse, Layers, Save, ShieldBan } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, Chip, useToast } from "@/components/ds";
import { IngredientPicker } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { Profile } from "@/lib/domain/profile";
import { ALLERGENS, type Allergen } from "@/lib/domain/schemas";

export interface GroupOption {
  id: string;
  label: string;
  ingredientIds: string[];
}

const entries = <K extends string>(o: Record<K, string>) => Object.entries(o) as [K, string][];
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

export function ExclusionsEditor({ initial, ingredients, groups }: { initial: Profile; ingredients: IngredientOption[]; groups: GroupOption[] }) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const excluded = new Set(profile.excludedIngredientIds);

  const update = (p: Profile) => {
    setProfile(p);
    setDirty(true);
  };
  const groupState = (g: GroupOption) => {
    const n = g.ingredientIds.filter((id) => excluded.has(id)).length;
    return n === 0 ? "none" : n === g.ingredientIds.length ? "all" : "some";
  };
  const toggleGroup = (g: GroupOption) => {
    const next = new Set(excluded);
    if (groupState(g) === "all") g.ingredientIds.forEach((id) => next.delete(id));
    else g.ingredientIds.forEach((id) => next.add(id));
    update({ ...profile, excludedIngredientIds: [...next] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await api.putProfile(profile);
      setProfile(data);
      setDirty(false);
      toast({ title: "Exclusions enregistrées", description: "Elles s'appliquent à tous vos menus.", tone: "success" });
    } catch (e) {
      toast({ title: "Erreur d'enregistrement", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  };
  const toggleAllergen = (a: Allergen) =>
    update({ ...profile, allergens: profile.allergens.includes(a) ? profile.allergens.filter((x) => x !== a) : [...profile.allergens, a] });

  return (
    <div className="space-y-4">
      <p className="rounded-field bg-surface-2 px-3 py-2.5 text-body-sm text-muted ring-1 ring-inset ring-line" aria-live="polite">
        <span className="font-semibold text-fg">{plural(profile.excludedIngredientIds.length, "aliment")}</span> exclu
        {profile.excludedIngredientIds.length > 1 ? "s" : ""} · <span className="font-semibold text-fg">{plural(profile.allergens.length, "allergie")}</span>
      </p>

      <Card aria-labelledby="groups-title">
        <CardHeader icon={Layers} title={<span id="groups-title">Familles d&apos;aliments</span>} description="Un appui exclut toute la famille ; ajustez ensuite aliment par aliment." />
        <div className="flex flex-wrap gap-2">
          {groups
            .filter((g) => g.ingredientIds.length > 0)
            .map((g) => {
              const state = groupState(g);
              const n = g.ingredientIds.filter((id) => excluded.has(id)).length;
              return (
                <Chip
                  key={g.id}
                  state={state === "all" ? "excluded" : state === "some" ? "partial" : "neutral"}
                  hint={state === "some" ? `Exclu en partie : ${n} aliment${n > 1 ? "s" : ""} sur ${g.ingredientIds.length}. Touchez pour exclure toute la famille.` : undefined}
                  onClick={() => toggleGroup(g)}
                >
                  {g.label}
                </Chip>
              );
            })}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-caption text-subtle" aria-label="Légende">
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-danger" /> Exclu
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full outline-dashed outline-1 outline-danger" /> Exclu en partie
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader icon={ShieldBan} title="Aliments exclus en permanence" description="Jamais proposés, dans aucun menu ni aucune liste de courses." />
        <IngredientPicker
          label="Ajouter un aliment"
          tone="danger"
          options={ingredients}
          selected={profile.excludedIngredientIds}
          onChange={(ids) => update({ ...profile, excludedIngredientIds: ids })}
        />
        {profile.excludedIngredientIds.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => update({ ...profile, excludedIngredientIds: [] })}>
            Tout retirer
          </Button>
        )}
      </Card>

      <Card aria-labelledby="allergies-title">
        <CardHeader
          icon={HeartPulse}
          title={<span id="allergies-title">Allergies et intolérances</span>}
          description="Seul endroit où elles se règlent : elles s'appliquent à tous vos menus. « Lait / lactose » exclut tous les produits laitiers."
        />
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="allergies-title">
          {entries(ALLERGENS).map(([a, label]) => (
            <Chip key={a} state={profile.allergens.includes(a) ? "excluded" : "neutral"} onClick={() => toggleAllergen(a)}>
              {label}
            </Chip>
          ))}
        </div>
      </Card>

      {dirty && (
        <div className="sticky bottom-[96px] z-20 lg:bottom-4">
          <div className="flex animate-toast-in items-center justify-between gap-3 rounded-card bg-glass p-2 pl-4 shadow-lift ring-1 ring-inset ring-line-strong backdrop-blur-xl">
            <span className="text-body-sm text-muted">Modifications non enregistrées</span>
            <Button icon={Save} loading={saving} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
