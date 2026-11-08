import { Palette } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { DataBackup } from "@/components/settings/DataBackup";

export const metadata = { title: "Personnaliser — Popote" };

export default function PersonnaliserPage() {
  return (
    <div>
      <PageHeader icon={Palette} title="Personnaliser" description="Couleurs, fond, taille du texte, barre de navigation et sauvegarde de vos données." />
      <AppearanceSettings />
      <div className="mt-4">
        <DataBackup />
      </div>
    </div>
  );
}
