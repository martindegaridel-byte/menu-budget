import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AppNav, MobileHeader, SideNav } from "@/components/AppNav";
import { PwaSupport } from "@/components/PwaSupport";
import { ToastProvider } from "@/components/ds";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/client/appearance";
import "@fontsource-variable/fraunces";
import "./globals.css";

export const metadata: Metadata = {
  title: "Popote — la cuisine maison à petit prix",
  description: "Vos dîners faits maison selon votre budget, vos goûts et votre placard, avec la liste de courses.",
  manifest: "/manifest.webmanifest",
  applicationName: "Popote",
  appleWebApp: { capable: true, title: "Popote", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6efe3" },
    { media: "(prefers-color-scheme: dark)", color: "#15110f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Thème et personnalisation appliqués avant l'affichage (évite un éclair de couleurs). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          <a
            href="#contenu"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-field focus:bg-surface-3 focus:px-4 focus:py-3 focus:text-fg focus:ring-2 focus:ring-focus"
          >
            Aller au contenu
          </a>
          <PwaSupport />
          <MobileHeader />
          <SideNav />
          <div className="lg:pl-64">
            <main id="contenu" className="mx-auto max-w-[720px] px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-4 lg:pb-16 lg:pt-10">
              {children}
            </main>
          </div>
          <AppNav />
        </ToastProvider>
      </body>
    </html>
  );
}
