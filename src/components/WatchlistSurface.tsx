"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Frame, Pill, StatCard } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import { relativeTime } from "@/lib/smartMoney";
import { readWatchlist, removeWatch, type WatchItem, type WatchTargetType } from "@/lib/watchlist";

export function WatchlistSurface() {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    setItems(readWatchlist());

    function handleChange() {
      setItems(readWatchlist());
    }

    window.addEventListener("pref:watchlist-change", handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener("pref:watchlist-change", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const markets = useMemo(() => items.filter((item) => item.type === "market"), [items]);
  const wallets = useMemo(() => items.filter((item) => item.type === "wallet"), [items]);

  function handleRemove(type: WatchTargetType, id: string) {
    setItems(removeWatch(type, id));
  }

  return (
    <Frame>
      <NavBar />
      <main className="grid gap-5 px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="flex flex-col gap-4 border-b border-dashed border-ink-3 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Eyebrow>{"// WATCHLIST ▸ PERSONAL BOARD"}</Eyebrow>
            <h1 className="mt-2 font-mono text-[22px] font-medium uppercase leading-tight tracking-[1px] text-ink sm:text-[26px]">
              FOLLOWED MARKETS & WALLETS
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center border border-accent bg-[rgba(96,165,250,0.08)] px-4 font-mono text-[10px] uppercase tracking-[1px] text-accent hover:bg-[rgba(96,165,250,0.14)]"
          >
            browse overview
          </Link>
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="following" value={String(items.length)} highlight />
          <StatCard label="markets" value={String(markets.length)} />
          <StatCard label="wallets" value={String(wallets.length)} />
          <StatCard label="latest add" value={items[0] ? relativeTime(items[0].addedAt) : "--"} highlight />
        </section>

        {items.length > 0 ? (
          <section className="grid gap-5 xl:grid-cols-2">
            <WatchSection title="markets" items={markets} onRemove={handleRemove} />
            <WatchSection title="wallets" items={wallets} onRemove={handleRemove} />
          </section>
        ) : (
          <EmptyWatchlist />
        )}
      </main>
    </Frame>
  );
}

function WatchSection({
  title,
  items,
  onRemove,
}: {
  title: string;
  items: WatchItem[];
  onRemove: (type: WatchTargetType, id: string) => void;
}) {
  return (
    <section className="overflow-hidden border border-ink-3 bg-paper-2">
      <div className="border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
        {title}
      </div>
      {items.length > 0 ? items.map((item) => (
        <article
          key={`${item.type}:${item.id}`}
          className="grid grid-cols-[1fr_auto] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
        >
          <Link href={item.href} className="min-w-0 hover:text-accent">
            <div className="truncate font-mono text-[13px] text-ink">{item.label}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(item.tags ?? [item.type]).slice(0, 3).map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
              <span className="px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
                {relativeTime(item.addedAt)}
              </span>
            </div>
            {item.subtitle ? (
              <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                {item.subtitle}
              </div>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => onRemove(item.type, item.id)}
            className="self-start border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3 hover:border-accent hover:text-accent"
          >
            remove
          </button>
        </article>
      )) : (
        <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">
          pick items to follow
        </div>
      )}
    </section>
  );
}

function EmptyWatchlist() {
  return (
    <section className="border border-dashed border-ink-3 bg-paper-2 p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid content-center gap-4 border border-ink-3 bg-paper p-5">
          <Eyebrow>{"// START HERE"}</Eyebrow>
          <h2 className="font-mono text-[20px] uppercase tracking-[1px] text-ink">
            BUILD YOUR BOARD
          </h2>
          <p className="max-w-[620px] font-mono text-[12px] leading-relaxed text-ink-2">
            Follow markets and wallets you care about. They stay here on this device so you can get back to them fast.
          </p>
          <div>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center border border-accent bg-[rgba(96,165,250,0.08)] px-4 font-mono text-[10px] uppercase tracking-[1px] text-accent hover:bg-[rgba(96,165,250,0.14)]"
            >
              browse overview
            </Link>
          </div>
        </div>
        <div className="grid gap-2 border border-ink-3 bg-ink-bg-soft p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1fr_58px] gap-3 border-b border-dashed border-ink-3 py-3 last:border-b-0">
              <span className={index % 2 === 0 ? "h-2 w-4/5 bg-paper" : "h-2 w-3/5 bg-paper"} />
              <span className="h-2 bg-paper" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
