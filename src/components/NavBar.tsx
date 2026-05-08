"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import clsx from "clsx";

const PRIMARY_ITEMS = [
  { label: "Overview", href: "/", helper: "Market gaps" },
  { label: "Feed", href: "/feed", helper: "Live holder stream" },
  { label: "Watchlist", href: "/watchlist", helper: "Saved markets and wallets" },
];

const WALLET_ITEMS = [
  { label: "All Wallets", href: "/wallets", helper: "Every tracked holder" },
  { label: "Leaders", href: "/leaders", helper: "Largest current exposure" },
  { label: "Politics", href: "/wallets?category=politics", helper: "Politics holders" },
  { label: "Sports", href: "/wallets?category=sports", helper: "Sports holders" },
  { label: "Crypto", href: "/wallets?category=crypto", helper: "Crypto holders" },
  { label: "Macro", href: "/wallets?category=macro", helper: "Rates and economy" },
  { label: "Weather", href: "/wallets?category=weather", helper: "Weather markets" },
  { label: "Sci-Tech", href: "/wallets?category=sci-tech", helper: "Science and tech" },
];

export function NavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  const isActive = (href: string) => {
    const baseHref = href.split("?")[0];
    const hrefCategory = new URLSearchParams(href.split("?")[1] ?? "").get("category");
    if (baseHref === "/wallets") {
      if (pathname !== "/wallets") return false;
      return hrefCategory ? activeCategory === hrefCategory : !activeCategory;
    }
    if (baseHref === "/") return pathname === "/";
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  };

  return (
    <aside className="z-20 min-w-0 overflow-hidden border-b border-ink-3 bg-paper-2/95 backdrop-blur lg:sticky lg:top-0 lg:h-[100dvh] lg:overflow-visible lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <header className="flex h-[50px] items-center justify-between gap-3 border-b border-ink-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-accent shadow-[0_0_12px_rgba(97,168,255,0.55)]" aria-hidden="true" />
            <span className="font-mono text-[15px] font-medium uppercase tracking-[2px] text-ink">
              PREF
            </span>
          </Link>
        </header>

        <nav className="flex max-w-full gap-2 overflow-x-auto px-2 py-2 lg:block lg:flex-1 lg:overflow-y-auto lg:px-2 lg:py-4">
          <SidebarSection title="discover">
            {PRIMARY_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                helper={item.helper}
                active={isActive(item.href)}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="wallets">
            {WALLET_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                helper={item.helper}
                active={isActive(item.href)}
              />
            ))}
          </SidebarSection>
        </nav>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="shrink-0 lg:mb-5 lg:min-w-0">
      <div className="mb-2 hidden px-2 font-mono text-[10px] uppercase tracking-[1px] text-ink-3 lg:block">
        {title}
      </div>
      <div className="flex gap-1 lg:grid">{children}</div>
    </section>
  );
}

function SidebarLink({
  href,
  label,
  helper,
  active,
}: {
  href: string;
  label: string;
  helper: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative grid min-w-[132px] grid-cols-[18px_1fr] items-start gap-2 rounded-[3px] border px-2 py-2 text-left transition-colors focus:outline-none active:translate-y-px lg:min-w-0",
        active
          ? "border-ink-3 bg-ink-bg-soft text-ink shadow-[inset_2px_0_0_var(--accent)]"
          : "border-transparent text-ink-2 hover:text-ink focus-visible:border-ink-3 focus-visible:outline-none",
      )}
    >
      <span
        className={clsx(
          "mt-[3px] h-3 w-3 border transition-colors",
          active ? "border-accent bg-[rgba(96,165,250,0.25)]" : "border-ink-3",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block truncate font-mono text-[12px] font-medium uppercase tracking-[0.5px]">
          {label}
        </span>
        <span className="mt-[2px] hidden truncate font-mono text-[10px] leading-tight text-ink-3 lg:block">
          {helper}
        </span>
      </span>
    </Link>
  );
}
