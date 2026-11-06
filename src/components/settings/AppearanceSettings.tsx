"use client";
import { Check, Eye, LayoutGrid, Moon, Navigation, Palette, RotateCcw, Smartphone, Sparkles, Square, Sun, SunMoon, Type } from "lucide-react";
import Link from "next/link";
import { NAV_LINKS } from "@/components/AppNav";
import { Badge, Button, Card, CardHeader, Chip, Segmented, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  SURFACES,
  resolveTheme,
  type Accent,
  type Appearance,
  type Corners,
  type Surface,
  type TextSize,
  type ThemePref,
} from "@/lib/client/appearance";
import { useAppearance } from "@/lib/client/use-appearance";

const SWITCH_TRACK =
  "relative h-6 w-10 shrink-0 rounded-full bg-surface-3 ring-1 ring-inset ring-line-strong transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-fg after:transition-transform after:duration-150 peer-checked:bg-accent-2 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus";

/** Page « Personnaliser » : couleurs, fond, texte, coins, animations et barre de navigation. */
export function AppearanceSettings() {
  const [a, setA] = useAppearance();
  const toast = useToast();
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setA({ ...a, [k]: v });
  const mode = resolveTheme(a.theme);

  return (
    <div className="space-y-4">
      {/* Aperçu en direct */}
      <Card aria-label="Aperçu" className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-2 text-caption font-medium uppercase tracking-wider text-subtle">
            <Eye aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Aperçu
          </p>
          <Badge tone="accent">{ACCENTS[a.accent].label}</Badge>
        </div>
        <div className="rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
          <p className="text-caption text-muted">Votre menu</p>
          <p className="text-title-3 font-semibold">5 repas · 19,82 €</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-accent-2 to-accent" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
            <Chip state="selected" tabIndex={-1}>
              Végé
            </Chip>
            <Chip state="neutral" tabIndex={-1}>
              Rapide
            </Chip>
            <Chip state="excluded" tabIndex={-1}>
              Porc
            </Chip>
          </div>
        </div>
        <Button icon={Sparkles} fullWidth tabIndex={-1} aria-hidden>
          Générer mon menu
        </Button>
      </Card>

      {/* Thème */}
      <Card>
        <CardHeader icon={SunMoon} title="Thème" description="« Auto » suit le réglage clair / sombre de votre téléphone." />
        <Segmented
          label="Thème"
          value={a.theme}
          onChange={(v: ThemePref) => set("theme", v)}
          options={[
            { value: "dark", label: "Sombre", icon: Moon },
            { value: "light", label: "Clair", icon: Sun },
            { value: "auto", label: "Auto", icon: Smartphone },
          ]}
        />
      </Card>

      {/* Couleur principale */}
      <Card>
        <CardHeader icon={Palette} title="Couleur principale" description="Boutons, sélections, barres de budget et liens." />
        <div role="radiogroup" aria-label="Couleur principale" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {(Object.keys(ACCENTS) as Accent[]).map((k) => {
            const on = a.accent === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("accent", k)}
                className={cn(
                  "focus-ring flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-field p-2 text-caption font-medium ring-1 ring-inset transition-colors duration-150",
                  on ? "bg-surface-3 text-fg ring-line-strong" : "text-muted ring-line hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span aria-hidden className="grid size-9 place-items-center rounded-full shadow-soft ring-2 ring-inset ring-black/10" style={{ background: ACCENTS[k].swatch }}>
                  {on && <Check className="size-5 animate-pop text-black/70" strokeWidth={3} />}
                </span>
                {ACCENTS[k].label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Couleur du fond */}
      <Card>
        <CardHeader
          icon={LayoutGrid}
          title="Couleur du fond"
          description={`Ambiance des fonds et des cartes ; chaque ambiance existe en thème ${mode === "dark" ? "sombre et clair" : "clair et sombre"}.`}
        />
        <div role="radiogroup" aria-label="Couleur du fond" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(SURFACES) as Surface[]).map((k) => {
            const on = a.surface === k;
            const [bg, card] = SURFACES[k][mode];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("surface", k)}
                className={cn(
                  "focus-ring flex flex-col gap-2 rounded-field p-2 text-left text-caption font-medium ring-1 ring-inset transition-colors duration-150",
                  on ? "bg-surface-3 text-fg ring-accent/50" : "text-muted ring-line hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span aria-hidden className="relative block h-14 overflow-hidden rounded-[10px] ring-1 ring-inset ring-black/10" style={{ background: bg }}>
                  <span className="absolute inset-x-2 bottom-2 top-4 rounded-md" style={{ background: card }} />
                  <span className="absolute bottom-3 left-3 h-1.5 w-8 rounded-full bg-accent" />
                </span>
                <span className="flex items-center justify-between">
                  {SURFACES[k].label}
                  {on && <Check aria-hidden className="size-4 text-accent-text" strokeWidth={2.5} />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Texte et formes */}
      <Card className="space-y-5">
        <CardHeader icon={Type} title="Texte et formes" />
        <div>
          <p className="mb-2 text-caption font-medium text-muted">Taille du texte</p>
          <Segmented
            label="Taille du texte"
            value={a.text}
            onChange={(v: TextSize) => set("text", v)}
            options={[
              { value: "normal", label: "Normal" },
              { value: "grand", label: "Grand" },
              { value: "tres-grand", label: "Très grand" },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-caption font-medium text-muted">Coins des cartes et des boutons</p>
          <Segmented
            label="Coins des cartes et des boutons"
            value={a.corners}
            onChange={(v: Corners) => set("corners", v)}
            options={[
              { value: "doux", label: "Doux" },
              { value: "arrondi", label: "Très arrondis" },
              { value: "net", label: "Nets", icon: Square },
            ]}
          />
        </div>
        <Toggle label="Réduire les animations" hint="Supprime les transitions et les effets d'apparition." checked={a.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
      </Card>

      {/* Barre de navigation */}
      <Card className="space-y-4">
        <CardHeader icon={Navigation} title="Barre de navigation" description="Sur mobile : choisissez les onglets affichés en bas de l'écran." />
        <Toggle label="Afficher les libellés sous les icônes" checked={a.navLabels} onChange={(v) => set("navLabels", v)} />
        <ul className="divide-y divide-line overflow-hidden rounded-field ring-1 ring-inset ring-line">
          {NAV_LINKS.map(({ href, label, full, icon: Icon }) => {
            const locked = href === "/";
            const shown = locked || !a.hiddenNav.includes(href);
            const name = full ?? label;
            return (
              <li key={href} className="flex items-center gap-3 bg-surface px-3 py-1">
                <Icon aria-hidden className="size-5 text-muted" strokeWidth={ICON_STROKE} />
                <Link href={href} className="focus-ring flex min-h-11 flex-1 items-center rounded text-body-sm font-medium hover:text-accent-text">
                  {name}
                </Link>
                {locked ? (
                  <span className="text-caption text-subtle">Toujours affiché</span>
                ) : (
                  <label className="relative inline-flex min-h-11 cursor-pointer items-center">
                    <span className="sr-only">Afficher « {name} » dans la barre</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      checked={shown}
                      onChange={(e) => set("hiddenNav", e.target.checked ? a.hiddenNav.filter((h) => h !== href) : [...a.hiddenNav, href])}
                    />
                    <span aria-hidden className={SWITCH_TRACK} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-subtle">Les onglets masqués restent accessibles depuis cette page.</p>
      </Card>

      <Button
        variant="secondary"
        icon={RotateCcw}
        fullWidth
        onClick={() => {
          setA({ ...DEFAULT_APPEARANCE });
          toast({ title: "Apparence réinitialisée", tone: "info" });
        }}
      >
        Réinitialiser l&apos;apparence
      </Button>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
      <span>
        <span className="block text-body-sm font-medium">{label}</span>
        {hint && <span className="block text-caption text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={SWITCH_TRACK} />
    </label>
  );
}
