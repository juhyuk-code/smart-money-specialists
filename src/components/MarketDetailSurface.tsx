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
  formatPercent,
  leadingOutcome,
  marketDetailPath,
  pricePercent,
  readSnapshot,
  relativeTime,
  specialistCount,
  type SmartMoneyMarket,
} from "@/lib/smartMoney";

export function MarketDetailSurface({ marketId }: { marketId: string }) {
  const [market, setMarket] = useState<SmartMoneyMarket | null>(null);

  useEffect(() => {
    const snapshot = readSnapshot();
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
  const specialists = market.outcomes.flatMap((outcome) =>
    outcome.topSpecialists.map((specialist) => ({
      ...specialist,
      outcomeCount: outcome.specialistCount,
      outcomeSize: outcome.totalCurrentSize,
    })),
  );
  const topWallets = [...specialists].sort((a, b) => b.currentSize - a.currentSize).slice(0, 8);
  const totalPositionSize = market.outcomes.reduce((sum, outcome) => sum + outcome.totalCurrentSize, 0);
  const categories = market.parentTags.length > 0 ? market.parentTags : ["market"];

  return (
    <Frame>
      <NavBar />
      <main className="grid gap-5 px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <nav className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
          <Link href="/markets" className="hover:text-ink-2">markets</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{market.marketSlug}</span>
        </nav>

        <header className="grid gap-4 border-b border-dashed border-ink-3 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-1">
              {categories.slice(0, 4).map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
              {lead ? <Pill tone="accent">{lead.outcome} lean</Pill> : null}
            </div>
            <Eyebrow>{"// MARKET ▸ DETAIL"}</Eyebrow>
            <h1 className="mt-2 max-w-[1040px] font-mono text-[22px] font-medium leading-tight text-ink sm:text-[28px]">
              {market.question}
            </h1>
          </div>
          <div className="flex gap-2">
            <FollowButton
              target={{
                type: "market",
                id: market.marketSlug || market.conditionId,
                label: market.question,
                href: marketDetailPath(market),
                subtitle: market.headline,
                tags: market.parentTags,
              }}
            />
            <a
              href={`/api/smart-money/share/${encodeURIComponent(market.conditionId)}.png`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center border border-accent bg-[rgba(96,165,250,0.08)] px-4 font-mono text-[10px] uppercase tracking-[1px] text-accent hover:bg-[rgba(96,165,250,0.14)]"
            >
              share
            </a>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="smart-money lean" value={lead ? `${lead.outcome} · ${lead.specialistCount}` : "--"} highlight />
          <StatCard label="avg entry" value={formatEntry(lead?.weightedAverageEntry)} />
          <StatCard label="position size" value={formatCurrency(totalPositionSize)} highlight />
          <StatCard label="24h volume" value={formatCurrency(market.volume24h)} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <OddsPanel prices={prices} />
            <OutcomePanel market={market} />
            <TopWalletsTable wallets={topWallets} />
          </div>

          <aside className="grid content-start gap-4">
            <section className="border border-ink-3 bg-paper-2 p-4">
              <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
                signal summary
              </div>
              <div className="grid gap-3">
                <SideMetric label="headline" value={market.headline || "Watching"} />
                <SideMetric label="specialists" value={String(specialistCount(market))} />
                <SideMetric label="market data" value={relativeTime(market.marketDataRefreshedAt)} />
                <SideMetric label="registry" value={relativeTime(market.registryRefreshedAt)} />
              </div>
            </section>

            <section className="border border-ink-3 bg-paper-2 p-4">
              <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
                movement surface
              </div>
              <div className="flex h-[150px] items-center justify-center border border-dashed border-ink-3 bg-ink-bg-soft">
                <SparkLine up={(lead?.totalCurrentSize ?? 0) >= 0} width={220} height={72} />
              </div>
            </section>
          </aside>
        </section>
      </main>
    </Frame>
  );
}

function OddsPanel({ prices }: { prices: Array<[string, number]> }) {
  return (
    <section className="border border-ink-3 bg-paper-2 p-4">
      <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
        public odds
      </div>
      <div className="grid gap-3">
        {prices.map(([outcome, price]) => (
          <div key={outcome} className="grid gap-2">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[1px]">
              <span className="text-ink">{outcome}</span>
              <span className="text-accent">{Math.round(price * 100)}c</span>
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

function OutcomePanel({ market }: { market: SmartMoneyMarket }) {
  return (
    <section className="border border-ink-3 bg-paper-2">
      <div className="grid grid-cols-[92px_1fr_120px_100px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
        <span>outcome</span>
        <span>specialists</span>
        <span>size</span>
        <span>avg entry</span>
      </div>
      {market.outcomes.length > 0 ? market.outcomes.map((outcome) => (
        <div
          key={outcome.outcome}
          className="grid grid-cols-[92px_1fr_120px_100px] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
        >
          <span className="font-mono text-[11px] uppercase text-accent">{outcome.outcome}</span>
          <span className="font-mono text-[11px] text-ink-2">{outcome.specialistCount}</span>
          <span className="font-mono text-[11px] text-ink-2">{formatCurrency(outcome.totalCurrentSize)}</span>
          <span className="font-mono text-[11px] text-ink-2">{formatEntry(outcome.weightedAverageEntry)}</span>
        </div>
      )) : (
        <div className="px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">watching</div>
      )}
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
    realizedPnl: number | null;
    roi: number | null;
  }>;
}) {
  return (
    <section className="overflow-x-auto border border-ink-3 bg-paper-2">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[1fr_86px_110px_90px_90px_80px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
          <span>wallet</span>
          <span>side</span>
          <span>size</span>
          <span>entry</span>
          <span>p&l</span>
          <span>roi</span>
        </div>
        {wallets.length > 0 ? wallets.map((wallet) => (
          <Link
            key={`${wallet.wallet}-${wallet.currentOutcome}`}
            href={`/wallets/${encodeURIComponent(wallet.wallet)}`}
            className="grid grid-cols-[1fr_86px_110px_90px_90px_80px] gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0 hover:bg-ink-bg-soft"
          >
            <span className="truncate font-mono text-[12px] text-ink">{wallet.displayLabel}</span>
            <span className="font-mono text-[10px] uppercase text-accent">{wallet.currentOutcome}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatCurrency(wallet.currentSize)}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatEntry(wallet.averageEntry)}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatCurrency(wallet.realizedPnl)}</span>
            <span className="font-mono text-[10px] text-ink-2">{formatPercent(wallet.roi)}</span>
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
    <div className="border border-dashed border-ink-3 bg-ink-bg-soft px-3 py-2">
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
          <Link href="/markets" className="hover:text-ink-2">markets</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{marketId}</span>
        </nav>
        <section className="border border-dashed border-ink-3 bg-paper-2 p-4 sm:p-6">
          <Eyebrow>{"// MARKET ▸ DETAIL"}</Eyebrow>
          <div className="mt-5 grid gap-3">
            <SkeletonLine width="72%" height="20px" />
            <SkeletonLine width="48%" height="20px" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
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
      className={`${accent ? "bg-accent/70" : "bg-ink-3"} block ${className}`}
      style={{ width, height }}
    />
  );
}
