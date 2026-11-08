"use client";
import { Bell, BellOff, BellRing, Send, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader, useToast } from "@/components/ds";
import { disableReminders, enableReminders, pushSupport, savedEndpoint, sendTestReminder, syncSchedule, type PushSupport } from "@/lib/client/push";
import type { ReminderEntry } from "@/lib/reminders";

/** Rappels du soir (notifications) : activation, test, et mise à jour du programme avec le planning. */
export function RemindersCard({ schedule }: { schedule: ReminderEntry[] }) {
  const [support, setSupport] = useState<PushSupport>("ok");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setSupport(pushSupport());
    setEnabled(!!savedEndpoint());
  }, []);

  // Planning modifié : on met à jour les rappels (après une courte pause).
  const key = JSON.stringify(schedule);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => void syncSchedule(schedule), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok, tone: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", tone: "error" });
    } finally {
      setBusy(false);
      setEnabled(!!savedEndpoint());
      setSupport(pushSupport());
    }
  };

  return (
    <Card>
      <CardHeader
        icon={enabled ? BellRing : Bell}
        title="Rappels du soir"
        description="Chaque jour vers 17 h : le plat prévu, ce qu'il faut sortir du congélateur et les produits qui périment."
      />
      {support === "install-first" ? (
        <p className="flex items-start gap-2 rounded-field bg-surface-2 p-3 text-body-sm ring-1 ring-inset ring-line">
          <Share aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
          Sur iPhone, ajoutez d&apos;abord l&apos;appli à l&apos;écran d&apos;accueil (Partager → « Sur l&apos;écran d&apos;accueil »), puis ouvrez-la depuis son icône pour activer les rappels.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-body-sm text-muted">Ce navigateur ne permet pas les notifications. Essayez avec Chrome, Safari (appli installée) ou Firefox.</p>
      ) : support === "denied" ? (
        <p className="text-body-sm text-muted">Les notifications sont bloquées pour Menu Budget : autorisez-les dans les réglages du téléphone ou du navigateur.</p>
      ) : enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Send} loading={busy} onClick={() => void run(sendTestReminder, "Notification de test envoyée")}>
            M&apos;envoyer un test
          </Button>
          <Button variant="ghost" icon={BellOff} disabled={busy} onClick={() => void run(disableReminders, "Rappels désactivés")}>
            Désactiver
          </Button>
        </div>
      ) : (
        <Button icon={Bell} loading={busy} onClick={() => void run(() => enableReminders(schedule), "Rappels activés")}>
          Activer les rappels
        </Button>
      )}
    </Card>
  );
}
