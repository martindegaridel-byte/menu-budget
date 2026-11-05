import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ds";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page introuvable"
      description="Cette page n'existe pas ou a été déplacée."
      action={
        <Link href="/" className="link inline-flex min-h-11 items-center">
          Retour au menu
        </Link>
      }
    />
  );
}
