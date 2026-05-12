"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Frame, Pill, SignalBadgeStrip, outcomeBgClass, outcomeTextClass } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import { FollowButton } from "@/components/FollowButton";
import {
  compareExposureRankedMarkets,
  fetchMarketDetail,
  formatCurrency,
  formatEntry,
  formatSignedPercent,
  globalPnlLabels,
  isOpenMarket,
  marketDiscrepancy,
  marketDetailPath,
  marketLeaderboardLabels,
  marketOutcomeGaps,
  readSnapshot,
  type LeaderboardLabel,
  type MarketGap,
  type SmartMoneyMarket,
} from "@/lib/smartMoney";

export function MarketDetailSurface({ marketId }: { marketId: string }) {
  const [market, setMarket] = useState<SmartMoneyMarket | null>(null);
  const [snapshotMarkets, setSnapshotMarkets] = useState<SmartMoneyMarket[]>([]);

  useEffect(() => {
    const snapshot = readSnapshot();
    if (snapshot) setSnapshotMarkets(snapshot.markets);
    const localMarket = snapshot?.markets.find((item) => {
      return item.marketSlug === marketId || item.conditionId === marketId;
    });
    if (localMarket) setMarket(localMarket);

    fetchMarketDetail(marketId)
      .then((item) => {
        if (item) setMarket(item);
      })
      .catch(() => undefined);
  }, [marketId]);

  if (!market) return <EmptyMarketDetail marketId={marketId} />;

  const prices = Object.entries(market.currentPrices);
  const holders = market.outcomes.flatMap((outcome) =>
    outcome.topSpecialists.map((specialist) => ({
      ...specialist,
      outcomeCount: outcome.specialistCount,
      outcomeSize: outcome.totalCurrentSize,
    })),
  );
  const topWallets = (market.primarySignalWallets?.length ? market.primarySignalWallets : holders)
    .sort((a, b) => b.currentSize - a.currentSize)
    .slice(0, 8);
  const secondaryWallets = (market.secondarySignalWallets ?? []).slice(0, 8);
  const categories = market.parentTags.length > 0 ? market.parentTags : ["market"];
  const gap = marketDiscrepancy(market);
  const gaps = marketOutcomeGaps(market);
  const leaderboardLabels = marketLeaderboardLabels(market, 6);
  const comparisonSummary = `${gap.outcome} is ${formatShare(gap.smartShare)} top-PnL wallet exposure vs ${formatShare(gap.marketPrice)} market`;
  const relatedMarkets = snapshotMarkets
    .filter((item) => item.conditionId !== market.conditionId)
    .filter(isOpenMarket)
    .filter((item) => item.parentTags.some((tag) => categories.includes(tag)))
    .sort(compareExposureRankedMarkets)
    .slice(0, 4);

  return (
    <Frame>
      <NavBar />
      <main className="min-w-0 px-3 py-4 sm:px-5 md:px-6 lg:px-5 xl:px-6">
        <nav className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
          <Link href="/" className="hover:text-ink-2">overview</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{market.marketSlug}</span>
        </nav>

        <header className="surface-card relative mt-4 overflow-hidden rounded-[3px]">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent via-[var(--positive)] to-[var(--negative)] opacity-80" />
          <section className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap gap-1">
                {categories.slice(0, 4).map((tag) => (
                  <Pill key={tag}>{tag}</Pill>
                ))}
                <SignalBadgeStrip labels={leaderboardLabels} limit={4} compact />
              </div>
              <div className="flex gap-2">
                <FollowButton
                  compact
                  target={{
                    type: "market",
                    id: market.marketSlug || market.conditionId,
                    label: market.question,
                    href: marketDetailPath(market),
                    subtitle: comparisonSummary,
                    tags: market.parentTags,
                  }}
                />
                <a
                  href={`/api/smart-money/share/${encodeURIComponent(market.conditionId)}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-[30px] items-center justify-center rounded-[2px] border border-accent bg-[rgba(97,168,255,0.08)] px-3 font-mono text-[10px] uppercase tracking-[1px] text-accent transition-colors hover:bg-[rgba(97,168,255,0.14)] active:translate-y-px"
                >
                  share
                </a>
              </div>
            </div>
            <h1 className="mt-5 max-w-[1040px] font-mono text-[18px] font-medium leading-tight text-ink sm:text-[24px]">
              {market.question}
            </h1>
            <OutcomeSignalPanel market={market} gaps={gaps} prices={prices} />
          </section>
        </header>

        <section className="mt-4 grid gap-4">
          <TopWalletsTable title="top-PnL wallet exposure" wallets={topWallets} />
          {secondaryWallets.length > 0 ? (
            <TopWalletsTable title="additional top-PnL wallet exposure" wallets={secondaryWallets} />
          ) : null}
          <RelatedMarketsPanel markets={relatedMarkets} />
        </section>
      </main>
    </Frame>
  );
}

function RelatedMarketsPanel({ markets }: { markets: SmartMoneyMarket[] }) {
  return (
    <section className="surface-card rounded-[3px] p-4">
      <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
        nearby markets
      </div>
      <div className="grid gap-2">
        {markets.length > 0 ? markets.map((market) => {
          const gap = marketDiscrepancy(market);
          return (
            <Link
              key={market.conditionId}
              href={marketDetailPath(market)}
              className="row-hover grid gap-2 rounded-[2px] border border-ink-3 bg-ink-bg-soft px-3 py-2"
            >
              <div className="line-clamp-2 font-mono text-[11px] leading-snug text-ink">{market.question}</div>
              <div className="flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
                <span>{market.parentTags[0] ?? "market"}</span>
                <span className={(gap.gap ?? 0) >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}>
                  {formatSignedPercent(gap.gap)}
                </span>
              </div>
            </Link>
          );
        }) : (
          <div className="rounded-[2px] border border-dashed border-ink-3 bg-ink-bg-soft px-3 py-6 font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
            watching
          </div>
        )}
      </div>
    </section>
  );
}

function OutcomeSignalPanel({
  market,
  gaps,
  prices,
}: {
  market: SmartMoneyMarket;
  gaps: MarketGap[];
  prices: Array<[string, number]>;
}) {
  const priceByOutcome = new Map(prices);
  const outcomes = market.outcomes.map((outcome) => ({
    ...outcome,
    gap: gaps.find((item) => item.outcome === outcome.outcome),
    publicPrice: priceByOutcome.get(outcome.outcome) ?? null,
  }));
  const smartDistribution = outcomes.map((outcome) => ({
    outcome: outcome.outcome,
    value: outcome.gap?.smartShare ?? null,
  }));
  const marketDistribution = outcomes.map((outcome) => ({
    outcome: outcome.outcome,
    value: outcome.gap?.marketPrice ?? outcome.publicPrice,
  }));
  const leadGap = gaps[0];
  const leadIsPositive = (leadGap?.gap ?? 0) >= 0;
  const leadDeltaLabel = `${formatPointDifference(leadGap?.gap)} ${leadIsPositive ? "above market" : "below market"}`;

  return (
    <div className="mt-5 overflow-x-auto border-t border-ink-3 pt-4">
      <div className="min-w-[760px]">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
            top-PnL wallet exposure vs market
          </div>
          <div className={leadIsPositive ? "font-mono text-[10px] uppercase tracking-[0.8px] text-[var(--positive)]" : "font-mono text-[10px] uppercase tracking-[0.8px] text-[var(--negative)]"}>
            {leadGap?.outcome ?? "Market"} {leadDeltaLabel}
          </div>
        </div>
        <div className="grid gap-5">
          <DistributionBar label="top-PnL exposure" values={smartDistribution} />
          <DistributionBar label="market" values={marketDistribution} />
        </div>
      </div>
    </div>
  );
}

function DistributionBar({
  label,
  values,
}: {
  label: string;
  values: Array<{ outcome: string; value: number | null }>;
}) {
  const validValues = values.filter((item): item is { outcome: string; value: number } => typeof item.value === "number");
  const total = validValues.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="grid grid-cols-[120px_1fr_180px] items-center gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.8px] text-ink-2">{label}</span>
      <div className="flex h-[30px] overflow-hidden bg-ink-bg-soft">
        {validValues.length > 0 ? validValues.map((item) => {
          const width = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div
              key={item.outcome}
              className={outcomeBgClass(item.outcome)}
              style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
            />
          );
        }) : (
          <div className="h-full w-full bg-ink-3" />
        )}
      </div>
      <div className="flex justify-end gap-4 font-mono text-[10px] uppercase tracking-[0.5px] text-ink">
        {values.map((item) => (
          <span key={item.outcome} className={outcomeTextClass(item.outcome)}>
            {item.outcome} {formatShare(item.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TopWalletsTable({
  title,
  wallets,
}: {
  title: string;
  wallets: Array<{
    wallet: string;
    displayLabel: string;
    label?: string;
    currentOutcome: string;
    currentSize: number;
    averageEntry: number | null;
    shares?: number;
    costBasis?: number | null;
    currentValue?: number | null;
    walletType?: string;
    smartScoreAdjusted?: number | null;
    leaderboardLabels?: LeaderboardLabel[];
  }>;
}) {
  return (
    <section className="surface-card overflow-x-auto rounded-[3px]">
      <div className="min-w-[620px]">
        <div className="border-b border-ink-3 bg-paper/70 px-3 py-2 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
          {title}
        </div>
        <div className="grid grid-cols-[1fr_70px_90px_100px_80px_130px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
          <span>wallet</span>
          <span>side</span>
          <span>shares</span>
          <span>cost</span>
          <span>entry</span>
          <span>type</span>
        </div>
        {wallets.length > 0 ? wallets.map((wallet) => (
          <Link
            key={`${wallet.wallet}-${wallet.currentOutcome}`}
            href={`/wallets/${encodeURIComponent(wallet.wallet)}`}
            className="row-hover grid grid-cols-[1fr_70px_90px_100px_80px_130px] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-[12px] text-ink">{wallet.displayLabel}</span>
              <SignalBadgeStrip labels={globalPnlLabels(wallet.leaderboardLabels)} limit={2} compact className="mt-1" />
            </span>
            <span className={`font-mono text-[10px] uppercase ${outcomeTextClass(wallet.currentOutcome)}`}>
              {wallet.currentOutcome}
            </span>
            <span className="font-mono text-[10px] text-ink-2">{Math.round(wallet.shares ?? wallet.currentSize).toLocaleString()}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatCurrency(wallet.costBasis)}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatEntry(wallet.averageEntry)}</span>
            <span className="truncate font-mono text-[10px] text-ink-2">{wallet.walletType ?? wallet.label ?? "top-PnL wallet"}</span>
          </Link>
        )) : (
          <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">watching</div>
        )}
      </div>
    </section>
  );
}

function formatShare(value: number | null) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "--";
}

function formatPointDifference(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${Math.round(Math.abs(value) * 100)} pts`;
}

function EmptyMarketDetail({ marketId }: { marketId: string }) {
  const rows = useMemo(() => Array.from({ length: 6 }), []);

  return (
    <Frame>
      <NavBar />
      <main className="grid gap-5 px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <nav className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
          <Link href="/" className="hover:text-ink-2">overview</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{marketId}</span>
        </nav>
        <section className="surface-card rounded-[3px] border-dashed p-4 sm:p-6">
          <Eyebrow>{"// MARKET ▸ DETAIL"}</Eyebrow>
          <div className="mt-5 grid gap-3">
            <SkeletonLine width="72%" height="20px" />
            <SkeletonLine width="48%" height="20px" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border border-ink-3 bg-paper p-3">
                <SkeletonLine width="58%" />
                <SkeletonLine width="36%" height="18px" accent className="mt-3" />
              </div>
            ))}
          </div>
          <div className="mt-6 border border-ink-3 bg-paper p-3">
            {rows.map((_, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px] gap-3 border-b border-dashed border-ink-3 py-3 last:border-b-0">
                <SkeletonLine width={index % 2 === 0 ? "70%" : "54%"} />
                <SkeletonLine width="64px" accent={index < 2} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}

function SkeletonLine({
  width,
  height = "10px",
  accent = false,
  className = "",
}: {
  width: string;
  height?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`${accent ? "bg-accent/70" : "bg-ink-3"} skeleton-shimmer block ${className}`}
      style={{ width, height }}
    />
  );
}
