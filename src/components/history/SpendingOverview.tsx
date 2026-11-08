"use client";
import { CalendarRange, HandCoins, PiggyBank } from "lucide-react";
import { useId } from "react";
import { Card, CardHeader } from "@/components/ds";
import { cn } from "@/components/ds/cn";
import { BudgetInput } from "@/components/planner/PreferencesForm";
import { MONTHLY_BUDGET_KEY, monthBudgetStatus, monthlySpending, savingsSummary, TAKEAWAY_PORTION_CENTS, type SavingsMenu } from "@/lib/client/budget";
import { usePersistentState } from "@/lib/client/storage";
import { formatEuros } from "@/lib/engine/money";

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" });

/** Budget mensuel et dépenses des 6 derniers mois (prévu / réel). */
export function SpendingOverview({ menus }: { menus: readonly SavingsMenu[] }) {
  const [monthly, setMonthly] = usePersistentState<number | null>(MONTHLY_BUDGET_KEY, null);
  const inputId = useId();
  const months = monthlySpending(menus);
  const max = Math.max(1, ...months.map((m) => Math.max(m.plannedCents, m.actualCents)));
  const status = monthly ? monthBudgetStatus(monthly, menus) : null;
  const savings = savingsSummary(menus);
  const tone = !status ? "accent" : status.ratio > 1 ? "danger" : status.ratio > 0.85 ? "warn" : "accent";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={PiggyBank} title="Budget du mois" description="Dépense = montant du ticket s'il est saisi, sinon le coût prévu du menu." />
        <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-end">
          <div>
            <label htmlFor={inputId} className="mb-2 block text-caption font-medium text-muted">
              Budget mensuel
            </label>
            <BudgetInput id={inputId} value={monthly ?? 0} onChange={(c) => setMonthly(c > 0 ? c : null)} />
          </div>
          {status ? (
            <div aria-live="polite">
              <div className="flex items-baseline justify-between text-body-sm">
                <span>
                  Dépensé <span className="font-semibold tabular-nums">{formatEuros(status.spentCents)}</span>
                </span>
                <span className={cn("font-semibold tabular-nums", tone === "danger" ? "text-danger-text" : tone === "warn" ? "text-warn-text" : "text-accent-text")}>
                  {status.overCents > 0 ? `Dépassé de ${formatEuros(status.overCents)}` : `Reste ${formatEuros(status.remainingCents)}`}
                </span>
              </div>
              <div
                role="meter"
                aria-label="Budget du mois dépensé"
                aria-valuemin={0}
                aria-valuemax={monthly ?? 0}
                aria-valuenow={status.spentCents}
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-3"
              >
                <div
                  className={cn("h-full rounded-full", tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent")}
                  style={{ width: `${Math.min(100, status.ratio * 100)}%` }}
                />
              </div>
              {status.remainingCents > 0 && (
                <p className="mt-1.5 text-caption text-muted">
                  Soit ≈ <span className="font-semibold tabular-nums text-fg">{formatEuros(status.weeklyCents)}</span> par semaine sur les {status.weeksLeft} semaine
                  {status.weeksLeft > 1 ? "s" : ""} restante{status.weeksLeft > 1 ? "s" : ""}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-muted">Fixez un budget mensuel : l&apos;appli vous dira ce qu&apos;il reste pour la semaine.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={HandCoins}
          title="Vos économies"
          description={`Sur vos ${savings.menus} menu${savings.menus > 1 ? "s" : ""} enregistré${savings.menus > 1 ? "s" : ""} (${savings.portions} portions).`}
        />
        <dl className="grid grid-cols-2 gap-2">
          {(
            [
              ["Coût moyen par portion", formatEuros(savings.perPortionCents)],
              ["Restés sous le budget", formatEuros(savings.underBudgetCents)],
              ["Grâce au placard", formatEuros(savings.pantryCents)],
              [`Face à un plat livré (≈ ${formatEuros(TAKEAWAY_PORTION_CENTS)})`, formatEuros(savings.vsTakeawayCents)],
            ] as const
          ).map(([k, v], i) => (
            <div key={k} className={cn("rounded-field p-3 ring-1 ring-inset", i === 3 ? "bg-accent-soft ring-accent/30" : "bg-surface-2 ring-line")}>
              <dt className="text-caption text-muted">{k}</dt>
              <dd className={cn("font-numeric text-title-3 font-semibold tabular-nums", i === 3 && "text-accent-text")}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-caption text-subtle">Dépense = ticket saisi, sinon coût prévu. Le plat livré est un repère indicatif.</p>
      </Card>

      <Card>
        <CardHeader icon={CalendarRange} title="Dépenses des 6 derniers mois" />
        <div className="flex h-40 items-end gap-2" role="img" aria-label={months.map((m) => `${monthFmt.format(m.date)} : prévu ${formatEuros(m.plannedCents)}${m.withActual ? `, réel ${formatEuros(m.actualCents)}` : ""}`).join(" ; ")}>
          {months.map((m) => (
            <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-1">
                <span className="w-1/2 max-w-5 rounded-t-[4px] bg-surface-3" style={{ height: `${(m.plannedCents / max) * 100}%` }} />
                {m.withActual > 0 && <span className="w-1/2 max-w-5 rounded-t-[4px] bg-accent" style={{ height: `${(m.actualCents / max) * 100}%` }} />}
              </div>
              <span className="text-[11px] capitalize text-subtle">{monthFmt.format(m.date).replace(".", "")}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex gap-4 text-caption text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-surface-3 ring-1 ring-inset ring-line-strong" /> Prévu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-accent" /> Réel (tickets saisis)
          </span>
        </p>
      </Card>
    </div>
  );
}
