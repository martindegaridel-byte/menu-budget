"use client";
import { useState } from "react";
import { Button, Card, Chips, IngredientPicker, Notice, cx } from "@/components/ui";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { Profile } from "@/lib/domain/profile";
import { ALLERGENS, type Allergen } from "@/lib/domain/schemas";

export interface GroupOption {
  id: string;
  label: string;
  ingredientIds: string[];
}

const entries = <K extends string>(o: Record<K, string>) => Object.entries(o) as [K, string][];

export function ExclusionsEditor({ initial, ingredients, groups }: { initial: Profile; ingredients: IngredientOption[]; groups: GroupOption[] }) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ level: "info" | "error"; text: string } | null>(null);
  const excluded = new Set(profile.excludedIngredientIds);

  const update = (p: Profile) => {
    setProfile(p);
    setDirty(true);
    setStatus(null);
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
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = (await res.json()) as Profile & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erreur d'enregistrement");
      setProfile(data);
      setDirty(false);
      setStatus({ level: "info", text: "Exclusions enregistrées : elles s'appliquent à tous vos menus." });
    } catch (e) {
      setStatus({ level: "error", text: e instanceof Error ? e.message : "Erreur d'enregistrement" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3" aria-labelledby="groups-title">
        <h2 id="groups-title" className="text-lg font-semibold">
          Familles d&apos;aliments
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">Un appui exclut toute la famille. Vous pouvez ensuite ajuster aliment par aliment.</p>
        <div className="flex flex-wrap gap-2">
          {groups
            .filter((g) => g.ingredientIds.length > 0)
            .map((g) => {
              const state = groupState(g);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={state === "all" ? true : state === "some" ? "mixed" : false}
                  onClick={() => toggleGroup(g)}
                  className={cx(
                    "min-h-9 rounded-full px-3 text-sm ring-1 transition focus-visible:outline-2 focus-visible:outline-emerald-600",
                    state === "all" && "bg-red-700 text-white ring-red-700",
                    state === "some" && "bg-red-50 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
                    state === "none" && "bg-white text-stone-800 ring-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-600",
                  )}
                >
                  {state === "all" ? "✕ " : ""}
                  {g.label}
                  {state === "some" && " (en partie)"}
                </button>
              );
            })}
        </div>
      </Card>

      <Card className="space-y-3">
        <IngredientPicker
          label="Aliments exclus en permanence"
          hint="Ils ne seront jamais proposés, dans aucun menu ni aucune liste de courses."
          options={ingredients}
          selected={profile.excludedIngredientIds}
          onChange={(ids) => update({ ...profile, excludedIngredientIds: ids })}
        />
        {profile.excludedIngredientIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => update({ ...profile, excludedIngredientIds: [] })}>
            Tout retirer
          </Button>
        )}
      </Card>

      <Card>
        <Chips
          label="Allergies et intolérances permanentes"
          options={entries(ALLERGENS)}
          selected={profile.allergens}
          onToggle={(a: Allergen) =>
            update({ ...profile, allergens: profile.allergens.includes(a) ? profile.allergens.filter((x) => x !== a) : [...profile.allergens, a] })
          }
        />
      </Card>

      <div className="sticky bottom-20 z-10">
        <Button size="lg" className="w-full shadow-lg" onClick={save} disabled={!dirty}>
          {dirty ? "Enregistrer mes exclusions" : "Exclusions à jour"}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {status && <Notice level={status.level}>{status.text}</Notice>}
      </div>
    </div>
  );
}
