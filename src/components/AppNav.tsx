"use client";
import { Ban, Carrot, CookingPot, History, Package, Palette, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { useAppearance } from "@/lib/client/use-appearance";

export const NAV_LINKS: readonly { href: string; label: string; icon: LucideIcon; full?: string }[] = [
  { href: "/", label: "Menu", icon: UtensilsCrossed },
  { href: "/batch", label: "Batch", icon: CookingPot, full: "Batch cooking" },
  { href: "/placard", label: "Placard", icon: Package },
  { href: "/exclusions", label: "Exclusions", icon: Ban },
  { href: "/magasins", label: "Magasins", icon: Store },
  { href: "/historique", label: "Historique", icon: History },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("focus-ring inline-flex items-center gap-2.5 rounded-field", className)}>
      <span className="grid size-9 place-items-center rounded-field bg-gradient-to-br from-accent to-accent-2 text-accent-fg shadow-soft">
        <Carrot aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </span>
      <span className="text-title-3 font-semibold tracking-tight text-fg">Menu Budget</span>
    </Link>
  );
}

/** En-tête mobile (marque, personnalisation, thème) ; caché sur grand écran où la barre latérale prend le relais. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-1.5">
        <Brand />
        <span className="flex items-center">
          <Link
            href="/personnaliser"
            aria-label="Personnaliser l'apparence"
            title="Personnaliser"
            className="focus-ring grid size-11 place-items-center rounded-full text-accent-text transition-colors duration-150 hover:bg-accent-soft"
          >
            <Palette aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
          </Link>
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

/** Barre latérale (grand écran). */
export function SideNav() {
  const active = useActive();
  const item = (on: boolean) =>
    cn(
      "focus-ring flex min-h-11 items-center gap-3 rounded-field px-3 text-body-sm font-medium transition-colors duration-150",
      on ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
    );
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 px-4 py-5 backdrop-blur-xl lg:flex">
      <Brand className="mb-8 px-2" />
      <nav aria-label="Navigation principale">
        <ul className="space-y-1">
          {NAV_LINKS.map(({ href, label, full, icon: Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined} className={item(on)}>
                  <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
                  {full ?? label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link href="/personnaliser" aria-current={active("/personnaliser") ? "page" : undefined} className={cn(item(active("/personnaliser")), "mt-auto")}>
        <Palette aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
        Personnaliser
      </Link>
      <div className="mt-2 flex items-center justify-between rounded-field px-2 text-caption text-subtle">
        <span>Thème</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Barre basse flottante (mobile), effet verre léger ; onglets et libellés réglables dans « Personnaliser ». */
export function AppNav() {
  const active = useActive();
  const [appearance] = useAppearance();
  const links = NAV_LINKS.filter((l) => l.href === "/" || !appearance.hiddenNav.includes(l.href));
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
      <ul className="mx-auto flex max-w-[600px] rounded-sheet bg-glass p-1 shadow-lift ring-1 ring-inset ring-line-strong backdrop-blur-xl">
        {links.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                aria-label={appearance.navLabels ? undefined : label}
                className={cn(
                  "focus-ring flex flex-col items-center justify-center gap-0.5 rounded-[16px] text-[10.5px] font-medium tracking-tight transition-colors duration-150",
                  appearance.navLabels ? "min-h-14" : "min-h-12",
                  on ? "bg-accent-soft text-accent-text" : "text-muted hover:text-fg",
                )}
              >
                <Icon aria-hidden className={cn("size-[22px] transition-transform duration-150", on && "scale-110")} strokeWidth={ICON_STROKE} />
                {appearance.navLabels && label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
