import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Menu Budget — repas sur mesure à petit prix",
  description: "Composez vos repas selon votre budget, vos goûts et votre placard, avec la liste de courses.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">
          Aller au contenu
        </a>
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
            <span aria-hidden className="text-xl">
              🥕
            </span>
            <span className="text-lg font-bold tracking-tight">Menu Budget</span>
          </div>
        </header>
        <main id="contenu" className="mx-auto max-w-2xl px-4 pb-28 pt-4">
          {children}
        </main>
        <AppNav />
      </body>
    </html>
  );
}
