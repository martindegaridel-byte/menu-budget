import { Palette } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";

export const metadata = { title: "Personnaliser — Menu Budget" };

export default function PersonnaliserPage() {
  return (
    <div>
      <PageHeader icon={Palette} title="Personnaliser" description="Couleurs, fond, taille du texte et barre de navigation : à votre goût." />
      <AppearanceSettings />
    </div>
  );
}
