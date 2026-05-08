"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Frame, Pill } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import { FollowButton } from "@/components/FollowButton";
import {
  fetchMarkets,
  formatCurrency,
  formatEntry,
  formatSignedPercent,
  marketDiscrepancy,
  marketDetailPath,
  readSnapshot,
  relativeTime,
  saveSnapshot,
  specialistCount,
  type SmartMoneyMarket,
} from "@/lib/smartMoney";

const OVERVIEW_LIMIT = 40;

export function MarketsDashboard() {
  const [markets, setMarkets] = useState<SmartMoneyMarket[]>([]);
  const [registryRefreshedAt, setRegistryRefreshedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const snapshot = readSnapshot();
    if (snapshot) {
      setMarkets(snapshot.markets);
      setRegistryRefreshedAt(snapshot.registryRefreshedAt);
    }

    fetchMarkets()
      .then((payload) => {
        if (!payload) return;
        setMarkets(payload.markets);
        setRegistryRefreshedAt(payload.registryRefreshedAt);
        saveSnapshot(payload);
      })
      .catch(() => {
        const fallback = readSnapshot();
        if (!fallback) return;
        setMarkets(fallback.markets);
        setRegistryRefreshedAt(fallback.registryRefreshedAt);
      });
  }, []);

  const topVolumeMarkets = useMemo(() => {
    return [...markets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, OVERVIEW_LIMIT);
  }, [markets]);

  const visibleMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return topVolumeMarkets
      .filter((market) => {
        if (!normalizedQuery) return true;
        return `${market.question} ${market.marketSlug} ${market.parentTags.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => gapMagnitude(marketDiscrepancy(b).gap) - gapMagnitude(marketDiscrepancy(a).gap));
  }, [query, topVolumeMarkets]);

  const leadMarket = visibleMarkets[0] ?? null;
  const gridMarkets = leadMarket ? visibleMarkets.slice(1) : visibleMarkets;

  return (
    <Frame>
      <NavBar />

      <main className="min-w-0 px-3 py-4 sm:px-5 md:px-6 lg:px-5 xl:px-6">
        <section className="mb-5 border-b border-ink-3 pb-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets"
            className="h-9 w-full min-w-0 rounded-[2px] border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent sm:w-[260px]"
          />
        </section>

        {leadMarket ? (
          <section className="grid gap-[14px]">
            <FeaturedMarketCard market={leadMarket} />
            <section className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
              {gridMarkets.map((market, index) => (
                <MarketGapCard key={market.conditionId} market={market} rank={index + 2} />
              ))}
            </section>
          </section>
        ) : (
          <EmptyOverviewSurface registryRefreshedAt={registryRefreshedAt} />
        )}
      </main>
    </Frame>
  );
}

function FeaturedMarketCard({ market }: { market: SmartMoneyMarket }) {
  const gap = marketDiscrepancy(market);
  const href = marketDetailPath(market);
  const gapIsPositive = (gap.gap ?? 0) >= 0;
  const totalHolders = specialistCount(market);
  const hasGap = typeof gap.gap === "number";

  return (
    <article className="surface-card group relative overflow-hidden rounded-[3px]">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent via-[var(--positive)] to-[var(--negative)] opacity-80" />
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Link href={href} className="block min-w-0 p-4 sm:p-5">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap gap-1">
                <Pill tone="accent">top discrepancy</Pill>
                <Pill>{market.parentTags[0] ?? "market"}</Pill>
                <Pill>{formatCurrency(market.volume24h)} 24h</Pill>
              </div>
              <h2 className="max-w-[980px] font-mono text-[22px] font-medium leading-tight text-ink transition-colors group-hover:text-white sm:text-[30px]">
                {market.question}
              </h2>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <div className={clsx("font-mono text-[38px] leading-none sm:text-[46px]", gapIsPositive ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
                {formatSignedPercent(gap.gap)}
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
                {gap.outcome} smart gap
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <DiscrepancyTrack label="holders" value={gap.smartShare} tone="green" />
            <DiscrepancyTrack label="market" value={gap.marketPrice} tone="red" />
          </div>
        </Link>

        <aside className="grid border-t border-ink-3 bg-paper/70 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-2 border-b border-ink-3">
            <FeaturedMetric label="holders" value={String(totalHolders)} />
            <FeaturedMetric label="holder size" value={formatCurrency(gap.holderSize)} tone="green" />
          </div>
          <div className="grid grid-cols-2 border-b border-ink-3">
            <FeaturedMetric label="market price" value={formatEntry(gap.marketPrice)} tone="red" />
            <FeaturedMetric label="signal" value={hasGap ? (gapIsPositive ? "overweight" : "underweight") : "watching"} />
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
              ranked by gap magnitude
            </div>
            <FollowButton
              compact
              target={{
                type: "market",
                id: market.marketSlug || market.conditionId,
                label: market.question,
                href,
                subtitle: `${gap.outcome} gap ${formatSignedPercent(gap.gap)}`,
                tags: market.parentTags,
              }}
            />
          </div>
        </aside>
      </div>
    </article>
  );
}

function MarketGapCard({ market, rank }: { market: SmartMoneyMarket; rank: number }) {
  const gap = marketDiscrepancy(market);
  const href = marketDetailPath(market);
  const totalHolders = specialistCount(market);
  const hasGap = typeof gap.gap === "number";
  const gapIsPositive = (gap.gap ?? 0) >= 0;

  return (
    <article className="surface-card group relative overflow-hidden rounded-[3px] transition-colors duration-200 active:translate-y-px">
      <Link href={href} className="block p-[15px]">
        <header className="mb-5 grid grid-cols-[34px_1fr] gap-3 pr-[64px]">
          <div className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-ink-3 bg-paper text-[10px] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            {String(rank).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex min-h-[20px] items-center gap-2">
              <Pill tone={hasGap && Math.abs(gap.gap ?? 0) >= 0.2 ? "accent" : "ink"}>
                {hasGap ? (gapIsPositive ? "holder overweight" : "holder underweight") : "holder signal"}
              </Pill>
            </div>
            <h2 className="line-clamp-2 min-h-[40px] font-mono text-[13px] font-medium leading-snug text-ink transition-colors group-hover:text-white">
              {market.question}
            </h2>
          </div>
        </header>

        <div className="mb-5">
          <div className={clsx("font-mono text-[22px] leading-none", gapIsPositive ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
            {formatSignedPercent(gap.gap)}
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.8px] text-ink-3">
            {gap.outcome} smart gap
          </div>
        </div>

        <div className="mb-4 grid gap-[7px]">
          <SplitBar label="holders" value={gap.smartShare} tone="green" />
          <SplitBar label="market" value={gap.marketPrice} tone="red" />
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-ink-3 pt-3">
          <FooterMetric label="holder side" value={formatCurrency(gap.holderSize)} tone="green" />
          <FooterMetric label="market price" value={formatEntry(gap.marketPrice)} tone="red" align="right" />
        </footer>
      </Link>

      <div className="absolute right-3 top-3">
        <FollowButton
          compact
          target={{
            type: "market",
            id: market.marketSlug || market.conditionId,
            label: market.question,
            href,
            subtitle: `${gap.outcome} gap ${formatSignedPercent(gap.gap)}`,
            tags: market.parentTags,
          }}
          className="bg-paper-2"
        />
      </div>

      <div className="border-t border-ink-3 bg-paper/90 px-[15px] py-2">
        <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
          <span className="truncate">{market.parentTags[0] ?? "market"}</span>
          <span>{totalHolders} holders</span>
          <span>{formatCurrency(market.volume24h)} 24h</span>
        </div>
      </div>
    </article>
  );
}

function FeaturedMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "green" | "red";
}) {
  return (
    <div className="min-w-0 p-4">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{label}</div>
      <div
        className={clsx(
          "truncate font-mono text-[16px] text-ink",
          tone === "green" && "text-[var(--positive)]",
          tone === "red" && "text-[var(--negative)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DiscrepancyTrack({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "green" | "red";
}) {
  const normalized = typeof value === "number" ? value : 0;
  const width = `${Math.max(0, Math.min(100, normalized * 100))}%`;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[1px]">
        <span className="text-ink-3">{label}</span>
        <span className="text-ink-2">{typeof value === "number" ? `${Math.round(value * 100)}%` : "--"}</span>
      </div>
      <div className="h-[8px] overflow-hidden bg-ink-bg-soft">
        <div className={clsx("h-full", tone === "green" ? "bg-[var(--positive)]" : "bg-[var(--negative)]")} style={{ width }} />
      </div>
    </div>
  );
}

function SplitBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "green" | "red";
}) {
  const normalized = typeof value === "number" ? value : 0;
  const width = `${Math.max(0, Math.min(100, normalized * 100))}%`;
  return (
    <div className="grid grid-cols-[54px_1fr_38px] items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">{label}</span>
      <div className="h-[5px] bg-ink-bg-soft">
        <div className={clsx("h-full", tone === "green" ? "bg-[var(--positive)]" : "bg-[var(--negative)]")} style={{ width }} />
      </div>
      <span className="text-right font-mono text-[9px] text-ink-2">
        {typeof value === "number" ? `${Math.round(value * 100)}%` : "--"}
      </span>
    </div>
  );
}

function gapMagnitude(value: number | null) {
  return typeof value === "number" ? Math.abs(value) : -1;
}

function FooterMetric({
  label,
  value,
  tone,
  align = "left",
}: {
  label: string;
  value: string;
  tone: "green" | "red";
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className={clsx("font-mono text-[12px]", tone === "green" ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
        {label}
      </div>
    </div>
  );
}

function EmptyOverviewSurface({ registryRefreshedAt }: { registryRefreshedAt: string | null }) {
  return (
    <section className="border border-dashed border-ink-3 bg-paper-2 p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="surface-card min-h-[260px] p-4">
            <div className="mb-4 grid grid-cols-[34px_1fr] gap-3">
              <span className="h-8 w-8 border border-ink-3" />
              <div className="grid gap-2">
                <span className="skeleton-shimmer h-2 w-24 bg-ink-3" />
                <span className="skeleton-shimmer h-3 w-full bg-ink-3" />
                <span className="skeleton-shimmer h-3 w-4/5 bg-ink-3" />
              </div>
            </div>
            <div className="skeleton-shimmer mt-10 h-8 w-24 bg-ink-3" />
            <div className="mt-8 grid gap-2">
              <span className="h-[5px] w-full bg-ink-bg-soft" />
              <span className="h-[5px] w-3/4 bg-ink-bg-soft" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
        Last snapshot {relativeTime(registryRefreshedAt)}
      </div>
    </section>
  );
}
