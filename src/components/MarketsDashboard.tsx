"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Frame, Pill, SparkLine, StatCard } from "@/components/ui";
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
  const [category, setCategory] = useState("all");
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

  const categories = useMemo(() => {
    const tags = new Set<string>();
    markets.forEach((market) => market.parentTags.forEach((tag) => tags.add(tag)));
    return ["all", ...Array.from(tags).sort()];
  }, [markets]);

  const topVolumeMarkets = useMemo(() => {
    return [...markets].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, OVERVIEW_LIMIT);
  }, [markets]);

  const visibleMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return topVolumeMarkets
      .filter((market) => {
        if (category !== "all" && !market.parentTags.includes(category)) return false;
        if (!normalizedQuery) return true;
        return `${market.question} ${market.marketSlug} ${market.parentTags.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => gapMagnitude(marketDiscrepancy(b).gap) - gapMagnitude(marketDiscrepancy(a).gap));
  }, [category, query, topVolumeMarkets]);

  const trackedWallets = new Set(
    topVolumeMarkets.flatMap((market) =>
      market.outcomes.flatMap((outcome) => outcome.topSpecialists.map((specialist) => specialist.wallet)),
    ),
  );
  const totalVolume = topVolumeMarkets.reduce((sum, market) => sum + (market.volume24h ?? 0), 0);
  const largestGap = visibleMarkets[0] ? marketDiscrepancy(visibleMarkets[0]) : null;

  return (
    <Frame>
      <NavBar />

      <main className="min-w-0 px-3 py-4 sm:px-5 md:px-6 lg:px-5 xl:px-6">
        <section className="mb-5 border-b border-ink-3 pb-5">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <Eyebrow>{"// OVERVIEW ▸ MARKET GAPS"}</Eyebrow>
              <h1 className="mt-2 font-mono text-[22px] font-medium uppercase leading-tight tracking-[1px] text-ink sm:text-[26px]">
                OVERVIEW
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
                <span>top 40 by 24h volume</span>
                <span className="text-ink-3">/</span>
                <span>ranked by holder-price gap</span>
              </div>
            </div>

            <div className="grid gap-2 sm:flex sm:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search markets"
                className="h-9 min-w-0 rounded-[2px] border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent sm:w-[260px]"
              />
              <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 sm:max-w-[520px] sm:pb-0">
                {categories.map((item) => (
                  <button key={item} type="button" onClick={() => setCategory(item)} className="shrink-0">
                    <Pill tone={category === item ? "accent" : "ink"}>{item}</Pill>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="volume set" value={topVolumeMarkets.length > 0 ? String(topVolumeMarkets.length) : "--"} />
            <StatCard label="24h volume" value={topVolumeMarkets.length > 0 ? formatCurrency(totalVolume) : "--"} highlight />
            <StatCard label="tracked wallets" value={topVolumeMarkets.length > 0 ? String(trackedWallets.size) : "--"} />
            <StatCard
              label="largest gap"
              value={largestGap ? formatSignedPercent(largestGap.gap) : "--"}
              highlight
            />
          </section>
        </section>

        {visibleMarkets.length > 0 ? (
          <section className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
            {visibleMarkets.map((market, index) => (
              <MarketGapCard key={market.conditionId} market={market} rank={index + 1} />
            ))}
          </section>
        ) : (
          <EmptyOverviewSurface registryRefreshedAt={registryRefreshedAt} />
        )}
      </main>
    </Frame>
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

        <div className="mb-5 grid grid-cols-[1fr_112px] items-end gap-3">
          <div>
            <div className={clsx("font-mono text-[22px] leading-none", gapIsPositive ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
              {formatSignedPercent(gap.gap)}
            </div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.8px] text-ink-3">
              {gap.outcome} smart gap
            </div>
          </div>
          <SparkLine up={gapIsPositive} width={104} height={42} className="justify-self-end opacity-95" />
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
