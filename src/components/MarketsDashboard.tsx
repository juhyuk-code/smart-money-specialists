"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Frame, SignalBadgeStrip, outcomeBgClass, outcomeTextClass } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import {
  COHORT_FILTERS,
  cohortLabel,
  compareExposureRankedMarkets,
  fetchMarkets,
  formatCurrency,
  formatPercent,
  formatSignedPercent,
  hasTopPnlExposure,
  isOpenMarket,
  marketDiscrepancy,
  marketDetailPath,
  marketExposureValue,
  marketExposureWalletCount,
  marketLeaderboardLabels,
  marketMatchesCohort,
  readSnapshot,
  relativeTime,
  saveSnapshot,
  type CohortFilter,
  type SmartMoneyMarket,
} from "@/lib/smartMoney";

const OVERVIEW_LIMIT = 40;

export function MarketsDashboard() {
  const [markets, setMarkets] = useState<SmartMoneyMarket[]>([]);
  const [registryRefreshedAt, setRegistryRefreshedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>("top_1000_pnl");

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

  const openMarkets = useMemo(() => [...markets].filter(isOpenMarket), [markets]);

  const cohortMatchedMarkets = useMemo(() => {
    return openMarkets.filter((market) => marketMatchesCohort(market, cohortFilter));
  }, [cohortFilter, openMarkets]);

  const isCohortFallback = openMarkets.length > 0 && cohortMatchedMarkets.length === 0;

  const topExposureMarkets = useMemo(() => {
    const rankedMarkets = cohortMatchedMarkets.length > 0 ? cohortMatchedMarkets : openMarkets;
    return [...rankedMarkets]
      .sort(compareExposureRankedMarkets)
      .slice(0, OVERVIEW_LIMIT);
  }, [cohortMatchedMarkets, openMarkets]);

  const visibleMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return topExposureMarkets.filter((market) => {
      if (!normalizedQuery) return true;
      return `${market.question} ${market.marketSlug} ${market.parentTags.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, topExposureMarkets]);

  const leadMarket = visibleMarkets[0] ?? null;
  const gridMarkets = leadMarket ? visibleMarkets.slice(1) : visibleMarkets;

  return (
    <Frame>
      <NavBar />

      <main className="min-w-0 px-3 py-4 sm:px-5 md:px-6 lg:px-5 xl:px-6">
        <section className="mb-5 flex flex-col gap-3 border-b border-ink-3 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets"
              className="h-9 w-full min-w-0 rounded-[2px] border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent sm:w-[260px]"
            />
            <div className="flex overflow-x-auto border border-ink-3 bg-paper-2 p-1">
              {COHORT_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setCohortFilter(filter.id)}
                  className={clsx(
                    "whitespace-nowrap rounded-[1px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.8px] transition-colors",
                    cohortFilter === filter.id ? "bg-accent text-paper" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
            {isCohortFallback
              ? "Waiting for top-PnL cohort exposure snapshot · showing available markets"
              : `Ranked by ${cohortLabel(cohortFilter)} top-PnL wallet exposure · volume display-only`}
          </div>
        </section>

        {leadMarket ? (
          <section className="grid gap-[14px]">
            <FeaturedMarketCard market={leadMarket} />
            <section className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
              {gridMarkets.map((market) => (
                <MarketGapCard key={market.conditionId} market={market} />
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
  const hasSmartMoney = hasTopPnlExposure(market);
  const labels = marketLeaderboardLabels(market);

  return (
    <article className="surface-card group relative overflow-hidden rounded-[3px]">
      <div className={clsx("absolute inset-x-0 top-0 h-[2px] opacity-85", outcomeBgClass(gap.outcome))} />
      <Link href={href} className="block min-w-0 p-4 sm:p-5">
        <div className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <div className="min-w-0">
            <SignalBadgeStrip labels={labels} limit={4} className="mb-3" />
            <h2 className="max-w-[980px] font-mono text-[22px] font-medium leading-tight text-ink transition-colors group-hover:text-white sm:text-[30px]">
              {market.question}
            </h2>
          </div>

          <div className="min-w-0 text-left lg:text-right">
            <div className={clsx("font-mono text-[54px] font-medium leading-none sm:text-[68px]", outcomeTextClass(gap.outcome))}>
              {formatSmartMoneyOdds(gap.smartShare, hasSmartMoney)}
            </div>
            <div className={clsx("mt-2 font-mono text-[11px] uppercase tracking-[1px]", outcomeTextClass(gap.outcome))}>
              {smartMoneyLabel(gap.outcome, hasSmartMoney)}
            </div>
            <SmartMoneyOddsContext marketPrice={gap.marketPrice} gap={gap.gap} className="mt-7 lg:justify-end" />
          </div>
        </div>

        <ExposureContext market={market} />
      </Link>
    </article>
  );
}

function MarketGapCard({ market }: { market: SmartMoneyMarket }) {
  const gap = marketDiscrepancy(market);
  const href = marketDetailPath(market);
  const hasSmartMoney = hasTopPnlExposure(market);
  const labels = marketLeaderboardLabels(market, 2);

  return (
    <article className="surface-card group relative overflow-hidden rounded-[3px] transition-colors duration-200 active:translate-y-px">
      <Link href={href} className="block p-[15px]">
        <header className="mb-5">
          <div className="min-w-0">
            <div className="mb-2 flex min-h-[20px] items-center gap-2 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
              <span>{market.parentTags[0] ?? "market"}</span>
            </div>
            <SignalBadgeStrip labels={labels} limit={2} compact className="mb-2" />
            <h2 className="line-clamp-2 min-h-[40px] font-mono text-[13px] font-medium leading-snug text-ink transition-colors group-hover:text-white">
              {market.question}
            </h2>
          </div>
        </header>

        <div className="mb-5">
          <div className={clsx("font-mono text-[36px] font-medium leading-none", outcomeTextClass(gap.outcome))}>
            {formatSmartMoneyOdds(gap.smartShare, hasSmartMoney)}
          </div>
          <div className={clsx("mt-2 font-mono text-[10px] uppercase tracking-[0.8px]", outcomeTextClass(gap.outcome))}>
            {smartMoneyLabel(gap.outcome, hasSmartMoney)}
          </div>
        </div>

        <SmartMoneyOddsContext marketPrice={gap.marketPrice} gap={gap.gap} compact />
        <ExposureContext market={market} compact />
      </Link>

      <div className={clsx("h-[2px] opacity-60", outcomeBgClass(gap.outcome))} />
    </article>
  );
}

function SmartMoneyOddsContext({
  marketPrice,
  gap,
  compact = false,
  className,
}: {
  marketPrice: number | null;
  gap: number | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap gap-x-3 gap-y-1 font-mono uppercase tracking-[0.8px] text-ink-3",
        compact ? "mb-4 text-[9px]" : "text-[10px]",
        className,
      )}
    >
      <span>Market odds {formatPercent(marketPrice)}</span>
      <span className={gapColor(gap)}>Gap {formatSignedPercent(gap)}</span>
    </div>
  );
}

function ExposureContext({
  market,
  compact = false,
}: {
  market: SmartMoneyMarket;
  compact?: boolean;
}) {
  return (
    <div className={clsx("grid grid-cols-3 gap-2 border-t border-ink-3 pt-3 font-mono uppercase tracking-[0.8px] text-ink-3", compact ? "text-[9px]" : "text-[10px]")}>
      <div>
        <div className="text-ink-2">{market.exposureRank?.rank ? `#${market.exposureRank.rank}` : "--"}</div>
        <div className="mt-1">Exposure rank</div>
      </div>
      <div>
        <div className="text-ink-2">{marketExposureWalletCount(market).toLocaleString()}</div>
        <div className="mt-1">Top-PnL wallets</div>
      </div>
      <div>
        <div className="text-ink-2">{formatCurrency(marketExposureValue(market))}</div>
        <div className="mt-1">Exposure</div>
      </div>
    </div>
  );
}

function formatSmartMoneyOdds(value: number, hasSmartMoney: boolean) {
  return hasSmartMoney ? formatPercent(value) : "--";
}

function smartMoneyLabel(outcome: string, hasSmartMoney: boolean) {
  return hasSmartMoney ? `${outcome} top-PnL exposure` : "top-PnL exposure unavailable";
}

function gapColor(value: number | null) {
  if (typeof value !== "number") return "";
  return value >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]";
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
