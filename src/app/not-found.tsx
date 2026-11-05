import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 py-10 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <Link href="/" className="text-emerald-800 underline dark:text-emerald-300">
        Retour au menu
      </Link>
    </div>
  );
}
