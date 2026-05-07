"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LiveDot } from "./ui";

const ITEMS = [
  { label: "HOLDERS", href: "/" },
  { label: "FEED", href: "/feed" },
  { label: "MARKETS", href: "/markets" },
  { label: "WALLETS", href: "/wallets" },
  { label: "WATCHLIST", href: "/watchlist" },
];

export function NavBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="flex items-center justify-between gap-3 border-b border-ink-3 bg-paper-2 px-4 py-3 sm:px-[22px]">
      <div className="flex min-w-0 items-center gap-4 sm:gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 bg-accent inline-block" aria-hidden="true" />
          <span className="text-[15px] uppercase tracking-[2px] font-mono text-ink">
            PREF
          </span>
        </Link>
        <nav className="-mr-2 flex items-center gap-[2px] overflow-x-auto pr-2">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "px-[10px] py-1 text-[11px] uppercase tracking-[1.2px] font-mono border-b transition-colors",
                isActive(it.href)
                  ? "text-ink border-accent"
                  : "text-ink-2 border-transparent hover:text-ink",
              )}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-[10px]">
        <LiveDot />
        <div className="hidden h-6 w-6 rounded-[2px] border border-ink-3 sm:block" />
      </div>
    </header>
  );
}
