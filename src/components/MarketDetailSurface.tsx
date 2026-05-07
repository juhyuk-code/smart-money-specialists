"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Frame, Pill, SparkLine, StatCard } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import { FollowButton } from "@/components/FollowButton";
import {
  fetchMarketDetail,
  formatCurrency,
  formatEntry,
  formatSignedPercent,
  leadingOutcome,
  marketDiscrepancy,
  marketDetailPath,
  marketOutcomeGaps,
  pricePercent,
  readSnapshot,
  relativeTime,
  specialistCount,
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
  const lead = leadingOutcome(market);
  const holders = market.outcomes.flatMap((outcome) =>
    outcome.topSpecialists.map((specialist) => ({
      ...specialist,
      outcomeCount: outcome.specialistCount,
      outcomeSize: outcome.totalCurrentSize,
    })),
  );
  const topWallets = [...holders].sort((a, b) => b.currentSize - a.currentSize).slice(0, 8);
  const totalPositionSize = market.outcomes.reduce((sum, outcome) => sum + outcome.totalCurrentSize, 0);
  const categories = market.parentTags.length > 0 ? market.parentTags : ["market"];
  const gap = marketDiscrepancy(market);
  const gaps = marketOutcomeGaps(market);
  const hasGap = typeof gap.gap === "number";
  const gapIsPositive = (gap.gap ?? 0) >= 0;
  const relatedMarkets = snapshotMarkets
    .filter((item) => item.conditionId !== market.conditionId)
    .filter((item) => item.parentTags.some((tag) => categories.includes(tag)))
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
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

        <header className="surface-card relative mt-4 overflow-hidden rounded-[3px] xl:grid xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent via-[var(--positive)] to-[var(--negative)] opacity-80" />
          <section className="min-w-0 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap gap-1">
              {categories.slice(0, 4).map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
              <Pill tone={hasGap && Math.abs(gap.gap ?? 0) >= 0.2 ? "accent" : "ink"}>
                {hasGap ? (gapIsPositive ? "holder overweight" : "holder underweight") : "holder signal"}
              </Pill>
            </div>
            <Eyebrow>{"// MARKET ▸ DETAIL"}</Eyebrow>
            <h1 className="mt-3 max-w-[1040px] font-mono text-[24px] font-medium leading-tight text-ink sm:text-[34px]">
              {market.question}
            </h1>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SideMetric label="holder lean" value={lead ? `${lead.outcome} / ${lead.specialistCount}` : "--"} />
              <SideMetric label="position size" value={formatCurrency(totalPositionSize)} />
              <SideMetric label="24h volume" value={formatCurrency(market.volume24h)} />
            </div>
          </section>

          <section className="border-t border-ink-3 bg-paper/70 p-4 xl:border-l xl:border-t-0">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className={gapIsPositive ? "font-mono text-[28px] leading-none text-[var(--positive)]" : "font-mono text-[28px] leading-none text-[var(--negative)]"}>
                  {formatSignedPercent(gap.gap)}
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.8px] text-ink-3">
                  {gap.outcome} smart gap
                </div>
              </div>
              <div className="flex gap-2">
                <FollowButton
                  compact
                  target={{
                    type: "market",
                    id: market.marketSlug || market.conditionId,
                    label: market.question,
                    href: marketDetailPath(market),
                    subtitle: `${gap.outcome} gap ${formatSignedPercent(gap.gap)}`,
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
            <div className="grid gap-[7px]">
              <SplitBar label="holders" value={gap.smartShare} tone="green" />
              <SplitBar label="market" value={gap.marketPrice} tone="red" />
            </div>
          </section>
        </header>

        <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="holder lean" value={lead ? `${lead.outcome} · ${lead.specialistCount}` : "--"} highlight />
          <StatCard label="avg entry" value={formatEntry(lead?.weightedAverageEntry)} />
          <StatCard label="position size" value={formatCurrency(totalPositionSize)} highlight />
          <StatCard label="24h volume" value={formatCurrency(market.volume24h)} />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <SignalGapPanel gaps={gaps} />
            <OddsPanel prices={prices} />
            <OutcomePanel market={market} />
            <TopWalletsTable wallets={topWallets} />
          </div>

          <aside className="grid content-start gap-4">
            <section className="surface-card rounded-[3px] p-4">
              <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
                signal summary
              </div>
              <div className="grid gap-3">
                <SideMetric label="headline" value={market.headline || "Watching"} />
                <SideMetric label="holders" value={String(specialistCount(market))} />
                <SideMetric label="gap" value={formatSignedPercent(gap.gap)} />
                <SideMetric label="market data" value={relativeTime(market.marketDataRefreshedAt)} />
                <SideMetric label="registry" value={relativeTime(market.registryRefreshedAt)} />
              </div>
            </section>

            <section className="surface-card rounded-[3px] p-4">
              <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
                position curve
              </div>
              <div className="flex h-[150px] items-center justify-center border border-dashed border-ink-3 bg-ink-bg-soft">
                <SparkLine up={(lead?.totalCurrentSize ?? 0) >= 0} width={220} height={72} />
              </div>
            </section>

            <RelatedMarketsPanel markets={relatedMarkets} />
          </aside>
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

function SignalGapPanel({ gaps }: { gaps: MarketGap[] }) {
  return (
    <section className="surface-card overflow-x-auto rounded-[3px]">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[92px_1fr_90px_90px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
          <span>outcome</span>
          <span>holder / market</span>
          <span>gap</span>
          <span>size</span>
        </div>
        {gaps.length > 0 ? gaps.map((gap) => (
          <div
            key={gap.outcome}
            className="row-hover grid grid-cols-[92px_1fr_90px_90px] items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
          >
            <span className="font-mono text-[11px] uppercase text-accent">{gap.outcome}</span>
            <div className="grid gap-[7px]">
              <SplitBar label="holders" value={gap.smartShare} tone="green" />
              <SplitBar label="market" value={gap.marketPrice} tone="red" />
            </div>
            <span className={(gap.gap ?? 0) >= 0 ? "font-mono text-[11px] text-[var(--positive)]" : "font-mono text-[11px] text-[var(--negative)]"}>
              {formatSignedPercent(gap.gap)}
            </span>
            <span className="font-mono text-[11px] text-ink-2">{formatCurrency(gap.holderSize)}</span>
          </div>
        )) : (
          <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">watching</div>
        )}
      </div>
    </section>
  );
}

function OddsPanel({ prices }: { prices: Array<[string, number]> }) {
  return (
    <section className="surface-card rounded-[3px] p-4">
      <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
        public odds
      </div>
      <div className="grid gap-3">
        {prices.map(([outcome, price]) => (
          <div key={outcome} className="grid gap-2">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[1px]">
              <span className="text-ink">{outcome}</span>
              <span className="text-accent">{formatEntry(price)}</span>
            </div>
            <div className="h-2 bg-ink-bg-soft">
              <div className="h-full bg-accent" style={{ width: `${pricePercent(price)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
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
        <div
          className={tone === "green" ? "h-full bg-[var(--positive)]" : "h-full bg-[var(--negative)]"}
          style={{ width }}
        />
      </div>
      <span className="text-right font-mono text-[9px] text-ink-2">
        {typeof value === "number" ? `${Math.round(value * 100)}%` : "--"}
      </span>
    </div>
  );
}

function OutcomePanel({ market }: { market: SmartMoneyMarket }) {
  return (
    <section className="surface-card overflow-x-auto rounded-[3px]">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[92px_1fr_120px_100px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
          <span>outcome</span>
          <span>holders</span>
          <span>size</span>
          <span>avg entry</span>
        </div>
        {market.outcomes.length > 0 ? market.outcomes.map((outcome) => (
          <div
            key={outcome.outcome}
            className="row-hover grid grid-cols-[92px_1fr_120px_100px] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
          >
            <span className="font-mono text-[11px] uppercase text-accent">{outcome.outcome}</span>
            <span className="font-mono text-[11px] text-ink-2">{outcome.specialistCount}</span>
            <span className="font-mono text-[11px] text-ink-2">{formatCurrency(outcome.totalCurrentSize)}</span>
            <span className="font-mono text-[11px] text-ink-2">{formatEntry(outcome.weightedAverageEntry)}</span>
          </div>
        )) : (
          <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">watching</div>
        )}
      </div>
    </section>
  );
}

function TopWalletsTable({
  wallets,
}: {
  wallets: Array<{
    wallet: string;
    displayLabel: string;
    currentOutcome: string;
    currentSize: number;
    averageEntry: number | null;
  }>;
}) {
  return (
    <section className="surface-card overflow-x-auto rounded-[3px]">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[1fr_86px_110px_90px_90px_80px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
          <span>wallet</span>
          <span>side</span>
          <span>size</span>
          <span>entry</span>
          <span>source</span>
          <span>signal</span>
        </div>
        {wallets.length > 0 ? wallets.map((wallet) => (
          <Link
            key={`${wallet.wallet}-${wallet.currentOutcome}`}
            href={`/wallets/${encodeURIComponent(wallet.wallet)}`}
            className="row-hover grid grid-cols-[1fr_86px_110px_90px_90px_80px] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
          >
            <span className="truncate font-mono text-[12px] text-ink">{wallet.displayLabel}</span>
            <span className="font-mono text-[10px] uppercase text-accent">{wallet.currentOutcome}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatCurrency(wallet.currentSize)}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatEntry(wallet.averageEntry)}</span>
            <span className="font-mono text-[10px] text-ink-2">holder</span>
            <span className="font-mono text-[10px] uppercase text-ink-2">{wallet.currentOutcome}</span>
          </Link>
        )) : (
          <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">watching</div>
        )}
      </div>
    </section>
  );
}

function SideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2px] border border-dashed border-ink-3 bg-ink-bg-soft px-3 py-2">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{label}</div>
      <div className="truncate font-mono text-[12px] text-ink">{value}</div>
    </div>
  );
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
