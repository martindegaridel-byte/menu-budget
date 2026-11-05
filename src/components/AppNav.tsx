"use client";
import { Ban, Carrot, History, Package, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";

const LINKS: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Menu", icon: UtensilsCrossed },
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

/** En-tête mobile (marque + thème) ; caché sur grand écran où la barre latérale prend le relais. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-1.5">
        <Brand />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Barre latérale (grand écran). */
export function SideNav() {
  const active = useActive();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 px-4 py-5 backdrop-blur-xl lg:flex">
      <Brand className="mb-8 px-2" />
      <nav aria-label="Navigation principale">
        <ul className="space-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "focus-ring flex min-h-11 items-center gap-3 rounded-field px-3 text-body-sm font-medium transition-colors duration-150",
                    on ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto flex items-center justify-between rounded-field px-2 text-caption text-subtle">
        <span>Thème</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Barre basse flottante (mobile), effet verre léger. */
export function AppNav() {
  const active = useActive();
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
      <ul className="mx-auto flex max-w-[560px] rounded-sheet bg-glass p-1 shadow-lift ring-1 ring-inset ring-line-strong backdrop-blur-xl">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[11px] font-medium transition-colors duration-150",
                  on ? "bg-accent-soft text-accent-text" : "text-muted hover:text-fg",
                )}
              >
                <Icon aria-hidden className={cn("size-[22px] transition-transform duration-150", on && "scale-110")} strokeWidth={ICON_STROKE} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
