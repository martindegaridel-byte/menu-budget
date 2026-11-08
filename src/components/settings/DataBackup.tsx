"use client";
import { Download, HardDriveDownload, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, CardHeader, useToast } from "@/components/ds";
import { api } from "@/lib/client/api";
import { backupFileName, deviceSettings, restoreDeviceSettings } from "@/lib/client/backup";

/** « Mes données » : sauvegarde dans un fichier et restauration (nouveau téléphone, autre navigateur). */
export function DataBackup() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const exportData = async () => {
    setBusy("export");
    try {
      const data = { ...(await api.exportData()), device: deviceSettings(window.localStorage) };
      const name = backupFileName();
      const file = new File([JSON.stringify(data)], name, { type: "application/json" });
      // Sur téléphone : feuille de partage (Fichiers, AirDrop, mail…) ; sinon téléchargement classique.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Sauvegarde Menu Budget" });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast({ title: "Sauvegarde téléchargée", description: name, tone: "success" });
    } catch (e) {
      toast({ title: "Sauvegarde impossible", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (file: File) => {
    setBusy("import");
    setSummary(null);
    try {
      const data = JSON.parse(await file.text()) as { device?: Record<string, string> };
      const { imported: n } = await api.importData(data);
      const settings = data.device && typeof data.device === "object" ? restoreDeviceSettings(window.localStorage, data.device) : 0;
      const parts = [
        n.menus && `${n.menus} menu${n.menus > 1 ? "s" : ""}`,
        n.pantry && `${n.pantry} article${n.pantry > 1 ? "s" : ""} du placard`,
        n.favorites && `${n.favorites} favori${n.favorites > 1 ? "s" : ""}`,
        n.ratings && `${n.ratings} note${n.ratings > 1 ? "s" : ""}`,
        n.stores && `${n.stores} magasin${n.stores > 1 ? "s" : ""}`,
        n.prices && `${n.prices} prix`,
        settings && "vos réglages",
      ].filter(Boolean);
      setSummary(parts.length ? `Restauré : ${parts.join(", ")}.` : "Rien de nouveau : tout était déjà là.");
      toast({ title: "Données restaurées", tone: "success" });
      if (settings) setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      const msg = e instanceof SyntaxError ? "Ce fichier n'est pas une sauvegarde Menu Budget." : e instanceof Error ? e.message : "Fichier illisible.";
      setSummary(null);
      toast({ title: "Restauration impossible", description: msg, tone: "error" });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        icon={HardDriveDownload}
        title="Mes données"
        description="Placard, exclusions, menus, favoris, notes, magasins, prix et réglages dans un fichier : pour changer de téléphone ou garder une copie."
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" icon={Download} loading={busy === "export"} disabled={!!busy} onClick={() => void exportData()}>
          Sauvegarder dans un fichier
        </Button>
        <Button variant="secondary" icon={Upload} loading={busy === "import"} disabled={!!busy} onClick={() => fileRef.current?.click()}>
          Restaurer un fichier
        </Button>
      </div>
      <label className="sr-only" htmlFor="restore-file">
        Fichier de sauvegarde à restaurer
      </label>
      <input
        id="restore-file"
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
        }}
      />
      {summary && (
        <p className="text-body-sm text-accent-text" aria-live="polite">
          {summary}
        </p>
      )}
      <p className="text-caption text-subtle">La restauration complète vos données sans rien effacer : les doublons sont ignorés.</p>
    </Card>
  );
}
