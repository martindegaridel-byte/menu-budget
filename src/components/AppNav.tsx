"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Menu", icon: "🍽️" },
  { href: "/placard", label: "Placard", icon: "🥫" },
  { href: "/exclusions", label: "Exclusions", icon: "🚫" },
  { href: "/magasins", label: "Magasins", icon: "🏪" },
  { href: "/historique", label: "Historique", icon: "🕘" },
] as const;

export function AppNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95"
    >
      <ul className="mx-auto flex max-w-2xl">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <li key={l.href} className="flex-1">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-600",
                  active ? "text-emerald-800 dark:text-emerald-300" : "text-stone-600 dark:text-stone-400",
                )}
              >
                <span aria-hidden className="text-lg">
                  {l.icon}
                </span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
