"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Eyebrow, Frame, Pill, SignalBadgeStrip, SparkLine, StatCard, outcomeTextClass } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import { FollowButton } from "@/components/FollowButton";
import {
  fetchFeed,
  fetchLeaders,
  fetchWalletDetail,
  fetchWallets,
  formatCurrency,
  formatEntry,
  globalPnlLabels,
  marketDetailPath,
  relativeTime,
  type FeedEvent,
  type Leader,
  type LeaderboardLabel,
  type PnlSummaryWindow,
  type WalletDetail,
  type WalletPnlPoint,
  type WalletRow,
} from "@/lib/smartMoney";

const LEADER_ROWS = Array.from({ length: 8 });
const FEED_ROWS = Array.from({ length: 7 });
const WALLET_ROWS = Array.from({ length: 6 });
const POSITION_ROWS = Array.from({ length: 5 });

export function LeadersSurface() {
  const [leaders, setLeaders] = useState<Leader[]>([]);

  useEffect(() => {
    fetchLeaders().then(setLeaders).catch(() => setLeaders([]));
  }, []);

  const hasData = leaders.length > 0;
  const totalVolume = leaders.reduce((sum, leader) => sum + leader.totalCurrentSize, 0);
  const totalPositions = leaders.reduce((sum, leader) => sum + leader.activeMarkets, 0);

  return (
    <Frame>
      <NavBar />
      <main className="px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-[6px]">
            <Eyebrow>{"// TOP-PNL WALLETS ▸ CURRENT EXPOSURE"}</Eyebrow>
            <h1 className="font-mono text-[19px] font-medium uppercase leading-tight tracking-[1px] text-ink sm:text-[21px] md:text-[24px]">
              PREF · TOP-PNL WALLETS
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
            <Pill>30d</Pill>
            <Pill tone="accent">7d</Pill>
            <Pill>24h</Pill>
            <Pill>filter</Pill>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="top-PnL wallets" value={hasData ? String(leaders.length) : "--"} />
          <StatCard label="open positions" value={hasData ? String(totalPositions) : "--"} highlight />
          <StatCard label="current exposure" value={hasData ? formatCurrency(totalVolume) : "--"} highlight />
          <StatCard label="top-PnL wallet" value={hasData ? leaders[0].displayLabel : "--"} />
        </section>

        <section className="surface-card overflow-x-auto rounded-[3px]">
          <div className="min-w-[820px]">
            <TableHeader columns="42px 44px 1fr 128px 84px 100px 160px 86px">
              <span>#</span>
              <span />
              <span>wallet</span>
              <span>exposure</span>
              <span>markets</span>
              <span>exposure</span>
              <span>trend</span>
              <span />
            </TableHeader>
            {hasData ? leaders.map((leader, index) => (
              <Link
                key={leader.wallet}
                href={`/wallets/${encodeURIComponent(leader.wallet)}`}
                className="row-hover grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "42px 44px 1fr 128px 84px 100px 160px 86px" }}
              >
                <span className="font-mono text-[12px] text-ink-3">{String(leader.rank).padStart(2, "0")}</span>
                <span className="h-6 w-6 border border-ink-3" />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12px] text-ink">{leader.displayLabel}</span>
                  <SignalBadgeStrip labels={globalPnlLabels(leader.leaderboardLabels)} limit={2} compact className="mt-1" />
                </span>
                <span className="font-mono text-[11px] text-ink-2">{formatCurrency(leader.totalCurrentSize)}</span>
                <span className="font-mono text-[11px] text-ink-2">{leader.activeMarkets}</span>
                <span className={`font-mono text-[11px] uppercase ${outcomeTextClass(leader.outcomes[0])}`}>
                  {leader.outcomes[0] ?? "--"}
                </span>
                <SparkLine up={(leader.realizedPnl ?? leader.totalCurrentSize) >= 0} width={120} />
                <span className="justify-self-end border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                  view
                </span>
              </Link>
            )) : LEADER_ROWS.map((_, index) => <LeaderSkeletonRow key={index} index={index} />)}
          </div>
        </section>
      </main>
    </Frame>
  );
}

export function FeedSurface() {
  const [feed, setFeed] = useState<FeedEvent[]>([]);

  useEffect(() => {
    fetchFeed().then(setFeed).catch(() => setFeed([]));
  }, []);

  const hasData = feed.length > 0;
  const trending = Array.from(new Map(feed.map((item) => [item.market.conditionId, item.market])).values()).slice(0, 4);
  const totalFlow = feed.reduce((sum, item) => sum + item.size, 0);
  const largestExposure = [...feed].sort((a, b) => b.size - a.size)[0] ?? null;

  return (
    <Frame>
      <NavBar />
      <main className="grid min-h-[100dvh] lg:grid-cols-[1fr_320px]">
        <section className="border-r border-ink-3">
          <header className="flex flex-col gap-4 border-b border-ink-3 bg-paper-2/95 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-[6px]">
              <Eyebrow>{"// FEED ▸ STREAM"}</Eyebrow>
              <h1 className="font-mono text-[20px] font-medium uppercase tracking-[1px] text-ink sm:text-[24px]">
                TOP-PNL EXPOSURE FEED
              </h1>
              <div className="flex items-center gap-[6px]">
                <span className="live-dot" />
                <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-2">
                  exposure surface
                </span>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              <Pill tone="accent">all</Pill>
              <Pill>buys</Pill>
              <Pill>sells</Pill>
              <Pill>size</Pill>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-3 border-b border-ink-3 bg-paper/70 p-4 sm:grid-cols-3 sm:p-5">
            <TapeMetric label="positions" value={hasData ? String(feed.length) : "--"} />
            <TapeMetric label="exposure size" value={hasData ? formatCurrency(totalFlow) : "--"} tone="accent" />
            <TapeMetric label="largest exposure" value={largestExposure ? formatCurrency(largestExposure.size) : "--"} />
          </section>

          <div>
            {hasData ? feed.slice(0, 40).map((item) => (
              <Link
                key={item.id}
                href={marketDetailPath(item.market)}
                className="row-hover grid grid-cols-[52px_36px_1fr_auto] gap-3 border-b border-dashed border-ink-3 px-4 py-4 sm:px-6"
              >
                <span className="font-mono text-[11px] text-ink-3">{relativeTime(item.time)}</span>
                <span className="h-6 w-6 border border-ink-3 bg-ink-bg-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1px]">
                    <span className="text-ink">{item.displayLabel}</span>
                    <span className="text-ink-2">{item.action}</span>
                    <span className={outcomeTextClass(item.outcome)}>{item.outcome}</span>
                    <span className="text-ink-3">{formatCurrency(item.size)}</span>
                  </div>
                  <p className="truncate font-mono text-[14px] text-ink">{item.market.question}</p>
                </div>
                <span className="hidden self-start rounded-[2px] border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3 sm:block">
                  open
                </span>
              </Link>
            )) : FEED_ROWS.map((_, index) => (
              <article
                key={index}
                className="grid grid-cols-[52px_36px_1fr_auto] gap-3 border-b border-dashed border-ink-3 px-4 py-4 sm:px-6"
              >
                <span className="font-mono text-[11px] text-ink-3">--:--</span>
                <span className="h-6 w-6 border border-ink-3" />
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SkeletonLine width="120px" />
                    <SkeletonLine width="54px" accent={index % 3 === 0} />
                    <SkeletonLine width="62px" />
                  </div>
                  <SkeletonLine width={index % 2 === 0 ? "72%" : "52%"} height="14px" />
                </div>
                <SkeletonLine width="38px" />
              </article>
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-6 bg-paper-2 p-4 sm:p-5">
          <section className="grid gap-3">
            <h2 className="font-mono text-[9px] uppercase tracking-[1.4px] text-ink-3">
              exposure markets
            </h2>
            {hasData ? trending.map((market) => (
              <Link key={market.conditionId} href={marketDetailPath(market)} className="surface-card flex items-center justify-between gap-3 rounded-[3px] px-3 py-3">
                <span className="truncate font-mono text-[12px] text-ink">{market.question}</span>
                <span className="shrink-0 font-mono text-[10px] text-accent">{formatCurrency(market.volume24h)}</span>
              </Link>
            )) : Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="surface-card flex items-center justify-between rounded-[3px] px-3 py-3">
                <SkeletonLine width={index % 2 === 0 ? "64%" : "48%"} />
                <SkeletonLine width="34px" accent={index === 0} />
              </div>
            ))}
          </section>
          <div className="rounded-[3px] border border-dashed border-accent bg-[rgba(97,168,255,0.045)] p-3 font-mono text-[10px] uppercase tracking-[1px] text-accent">
            feed follows top-PnL wallet exposure
          </div>
        </aside>
      </main>
    </Frame>
  );
}

export function WalletsSurface({ category = "all" }: { category?: string }) {
  const [wallets, setWallets] = useState<WalletRow[]>([]);

  useEffect(() => {
    fetchWallets().then(setWallets).catch(() => setWallets([]));
  }, []);

  const normalizedCategory = category.toLowerCase();
  const filteredWallets =
    normalizedCategory === "all"
      ? wallets
      : wallets.filter((wallet) =>
          wallet.categories.some((item) => item.toLowerCase() === normalizedCategory),
        );
  const categoryLabel = normalizedCategory === "all" ? "all" : normalizedCategory;
  const hasData = filteredWallets.length > 0;
  const totalExposure = filteredWallets.reduce((sum, wallet) => sum + wallet.totalCurrentSize, 0);
  const totalMarkets = filteredWallets.reduce((sum, wallet) => sum + wallet.activeMarkets, 0);

  return (
    <Frame>
      <NavBar />
      <main className="px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="mb-5 flex flex-col gap-4 border-b border-dashed border-ink-3 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-[6px]">
            <Eyebrow>{"// WALLETS ▸ INDEX"}</Eyebrow>
            <h1 className="font-mono text-[20px] font-medium uppercase tracking-[1px] text-ink sm:text-[24px]">
              {categoryLabel === "all" ? "TOP-PNL WALLETS" : `${categoryLabel} wallets`}
            </h1>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TapeMetric label="wallets" value={hasData ? String(filteredWallets.length) : "--"} />
          <TapeMetric label="exposure" value={hasData ? formatCurrency(totalExposure) : "--"} tone="accent" />
          <TapeMetric label="open markets" value={hasData ? String(totalMarkets) : "--"} />
        </section>

        <section className="surface-card overflow-hidden rounded-[3px]">
          {hasData ? filteredWallets.map((wallet) => (
            <Link
              key={wallet.wallet}
              href={`/wallets/${encodeURIComponent(wallet.wallet)}`}
              className="row-hover grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-dashed border-ink-3 px-4 py-3 last:border-b-0"
            >
              <span className="h-6 w-6 border border-ink-3" />
              <div className="min-w-0">
                <div className="truncate font-mono text-[13px] text-ink">{wallet.displayLabel}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                  <span>{wallet.activeMarkets} markets</span>
                  <span className="text-accent">{formatCurrency(wallet.totalCurrentSize)}</span>
                  {(wallet.categories ?? []).slice(0, 2).map((item) => (
                    <span key={item} className="text-ink-2">{item}</span>
                  ))}
                </div>
              </div>
              <span className="rounded-[2px] border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                open
              </span>
            </Link>
          )) : wallets.length > 0 ? (
            <div className="px-4 py-10 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">
              No wallets matched this category.
            </div>
          ) : WALLET_ROWS.map((_, index) => (
            <div
              key={index}
              className="row-hover grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-dashed border-ink-3 px-4 py-3 last:border-b-0"
            >
              <span className="h-6 w-6 border border-ink-3" />
              <div className="grid gap-2">
                <SkeletonLine width={index % 2 === 0 ? "220px" : "160px"} />
                <SkeletonLine width="110px" />
              </div>
              <SkeletonLine width="44px" />
            </div>
          ))}
        </section>
      </main>
    </Frame>
  );
}

function TapeMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "accent";
}) {
  return (
    <div className="surface-card rounded-[3px] px-3 py-3">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{label}</div>
      <div className={tone === "accent" ? "truncate font-mono text-[18px] text-accent" : "truncate font-mono text-[18px] text-ink"}>
        {value}
      </div>
    </div>
  );
}

export function WalletDetailSurface({ wallet }: { wallet: string }) {
  const [detail, setDetail] = useState<WalletDetail | null>(null);

  useEffect(() => {
    fetchWalletDetail(wallet).then(setDetail).catch(() => setDetail(null));
  }, [wallet]);

  const displayWallet = detail?.displayLabel ?? wallet;
  const positions = detail?.positions ?? [];
  const closedPositions = detail?.closedPositions ?? [];
  const labels = walletLabels(detail);
  const hasData = Boolean(detail);

  return (
    <Frame>
      <NavBar />
      <main className="grid gap-6 px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <nav className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
          <Link href="/wallets" className="hover:text-ink-2">wallets</Link>
          <span className="px-1">/</span>
          <span className="text-ink-2">{displayWallet}</span>
        </nav>

        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-14 w-14 shrink-0 border border-ink-3" />
            <div className="min-w-0">
              <h1 className="truncate font-mono text-[22px] text-ink sm:text-[28px]">{displayWallet}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill tone="accent">{hasData ? `rank ${detail?.rank ?? "--"}` : "rank"}</Pill>
                <Pill>{detail?.categories?.[0] ?? "top-PnL"}</Pill>
                {detail?.polymarketProfileUrl ? (
                  <Link
                    href={detail.polymarketProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[22px] items-center rounded-[2px] border border-ink-3 bg-[rgba(255,255,255,0.012)] px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.6px] text-ink-2 hover:border-accent hover:text-accent"
                  >
                    Polymarket profile ↗
                  </Link>
                ) : null}
              </div>
              {labels.length > 0 ? <SignalBadgeStrip labels={labels} limit={8} className="mt-2" /> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <FollowButton
              target={{
                type: "wallet",
                id: detail?.wallet ?? wallet,
                label: displayWallet,
                href: `/wallets/${encodeURIComponent(detail?.wallet ?? wallet)}`,
                subtitle: hasData ? `${detail?.activeMarkets ?? 0} markets · ${formatCurrency(detail?.totalCurrentSize)}` : "wallet",
                tags: detail?.categories,
              }}
            />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard label="current exposure" value={hasData ? formatCurrency(detail?.totalCurrentSize) : "--"} highlight />
            <StatCard label="open markets" value={hasData ? String(detail?.activeMarkets ?? 0) : "--"} highlight />
            <StatCard label="closed markets" value={hasData ? String(detail?.closedMarkets ?? closedPositions.length) : "--"} />
            <StatCard label="wallet source" value={hasData ? "top-PnL" : "--"} />
          </div>
          <section className="surface-card rounded-[3px] p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-accent">
                historical PnL
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
                30D · 90D · lifetime
              </div>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <PnlWindowCard label="30D PnL" window={detail?.pnlSummary?.last30d} />
              <PnlWindowCard label="90D PnL" window={detail?.pnlSummary?.last90d} />
              <PnlWindowCard label="lifetime PnL" window={detail?.pnlSummary?.lifetime} />
            </div>
            <PnlChart points={detail?.pnlSeries ?? []} />
          </section>
        </section>

        <section className="surface-card overflow-x-auto rounded-[3px]">
          <SectionTitle eyebrow="current positions" meta={`${positions.length} open`} />
          <div className="min-w-[760px]">
            <TableHeader columns="1fr 72px 96px 128px 100px">
              <span>market</span>
              <span>side</span>
              <span>size</span>
              <span>entry</span>
              <span />
            </TableHeader>
            {hasData && positions.length > 0 ? positions.map((position) => (
              <Link
                key={position.conditionId}
                href={marketDetailPath(position)}
                className="row-hover grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 72px 96px 128px 100px" }}
              >
                <span className="truncate font-mono text-[12px] text-ink">{position.question}</span>
                <span className={`font-mono text-[10px] uppercase ${outcomeTextClass(position.outcome)}`}>
                  {position.outcome}
                </span>
                <span className="font-mono text-[10px] text-ink-2">{formatCurrency(position.currentSize)}</span>
                <span className="font-mono text-[10px] text-ink-2">avg {formatEntry(position.averageEntry)}</span>
                <span className="justify-self-end rounded-[2px] border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-3">
                  market
                </span>
              </Link>
            )) : hasData ? (
              <EmptyTableRow columns="1fr" label="No current positions." />
            ) : POSITION_ROWS.map((_, index) => (
              <div
                key={index}
                className="grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 72px 96px 128px 100px" }}
              >
                <SkeletonLine width={index % 2 === 0 ? "72%" : "54%"} />
                <SkeletonLine width="34px" accent={index % 2 === 0} />
                <SkeletonLine width="58px" />
                <SkeletonLine width="84px" />
                <SkeletonLine width="60px" accent={index < 3} />
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card overflow-x-auto rounded-[3px]">
          <SectionTitle eyebrow="closed positions" meta="sorted by biggest win" />
          <div className="min-w-[760px]">
            <TableHeader columns="1fr 92px 112px 128px 92px">
              <span>market</span>
              <span>outcome</span>
              <span>realized PnL</span>
              <span>bought / stake</span>
              <span>closed</span>
            </TableHeader>
            {hasData && closedPositions.length > 0 ? closedPositions.map((position) => (
              <Link
                key={`${position.conditionId}-${position.outcome ?? "outcome"}`}
                href={marketDetailPath({ conditionId: position.conditionId, marketSlug: position.marketSlug ?? position.slug ?? "" })}
                className="row-hover grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 92px 112px 128px 92px" }}
              >
                <span className="truncate font-mono text-[12px] text-ink">{position.title ?? position.question ?? position.conditionId}</span>
                <span className={`font-mono text-[10px] uppercase ${outcomeTextClass(position.outcome)}`}>
                  {position.outcome ?? "--"}
                </span>
                <span className={`font-mono text-[10px] ${signedValueClass(position.realizedPnl)}`}>
                  {formatSignedCurrency(position.realizedPnl)}
                </span>
                <span className="font-mono text-[10px] text-ink-2">{formatCurrency(position.totalBought)}</span>
                <span className="font-mono text-[10px] text-ink-3">{formatShortDate(position.closedAt ?? position.timestamp)}</span>
              </Link>
            )) : hasData ? (
              <EmptyTableRow columns="1fr" label="No closed positions returned yet." />
            ) : POSITION_ROWS.slice(0, 4).map((_, index) => (
              <div
                key={index}
                className="grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
                style={{ gridTemplateColumns: "1fr 92px 112px 128px 92px" }}
              >
                <SkeletonLine width={index % 2 === 0 ? "76%" : "58%"} />
                <SkeletonLine width="42px" accent={index % 2 === 0} />
                <SkeletonLine width="64px" accent={index < 2} />
                <SkeletonLine width="72px" />
                <SkeletonLine width="52px" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </Frame>
  );
}

function SectionTitle({ eyebrow, meta }: { eyebrow: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-3 bg-paper-2/80 px-3 py-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[1.2px] text-accent">{eyebrow}</h2>
      {meta ? <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{meta}</span> : null}
    </div>
  );
}

function PnlWindowCard({ label, window }: { label: string; window?: PnlSummaryWindow }) {
  return (
    <div className="rounded-[2px] border border-ink-3 bg-ink-bg-soft px-3 py-2">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{label}</div>
      <div className={`font-mono text-[17px] ${signedValueClass(window?.realizedPnl)}`}>
        {formatSignedCurrency(window?.realizedPnl)}
      </div>
      <div className="mt-1 flex gap-2 font-mono text-[9px] uppercase tracking-[0.7px] text-ink-3">
        <span>{window ? `${window.markets} mkts` : "-- mkts"}</span>
        <span>{formatCurrency(window?.totalBought)} bought</span>
      </div>
    </div>
  );
}

function PnlChart({ points }: { points: WalletPnlPoint[] }) {
  const width = 640;
  const height = 210;
  const padding = 18;
  const values = points.map((point) => point.cumulativePnl).filter(Number.isFinite);
  const hasSeries = values.length > 1;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const chartPoints = hasSeries
    ? points.map((point, index) => {
        const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - ((point.cumulativePnl - min) / range) * (height - padding * 2);
        return `${roundSvg(x)},${roundSvg(y)}`;
      }).join(" ")
    : "";
  const zeroY = height - padding - ((0 - min) / range) * (height - padding * 2);
  const latest = points[points.length - 1];

  return (
    <div className="border border-dashed border-ink-3 bg-ink-bg-soft p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
        <span>cumulative realized PnL</span>
        <span>{latest ? formatShortDate(latest.date) : "no series"}</span>
      </div>
      {hasSeries ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[210px] w-full" role="img" aria-label="Historical wallet PnL chart">
          <line x1={padding} x2={width - padding} y1={roundSvg(zeroY)} y2={roundSvg(zeroY)} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 5" />
          <polyline
            points={`${chartPoints} ${width - padding},${height - padding} ${padding},${height - padding}`}
            fill={latest.cumulativePnl >= 0 ? "rgba(69,185,141,0.12)" : "rgba(212,80,93,0.10)"}
            stroke="none"
          />
          <polyline
            points={chartPoints}
            fill="none"
            stroke={latest.cumulativePnl >= 0 ? "var(--positive)" : "var(--negative)"}
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
      ) : (
        <div className="flex h-[210px] items-center justify-center">
          <SparkLine up width={320} height={110} />
        </div>
      )}
    </div>
  );
}

function EmptyTableRow({ columns, label }: { columns: string; label: string }) {
  return (
    <div
      className="grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-8 font-mono text-[11px] uppercase tracking-[1px] text-ink-3 last:border-b-0"
      style={{ gridTemplateColumns: columns }}
    >
      <span>{label}</span>
    </div>
  );
}

function walletLabels(detail: WalletDetail | null): LeaderboardLabel[] {
  const labels = new Map<string, LeaderboardLabel>();
  for (const label of [...(detail?.leaderboardLabels ?? []), ...(detail?.labels ?? [])]) {
    labels.set(`${label.id}-${label.label}-${label.rank ?? ""}`, label);
  }
  return Array.from(labels.values()).sort((a, b) => {
    const globalDelta = Number(b.type === "global_pnl") - Number(a.type === "global_pnl");
    if (globalDelta !== 0) return globalDelta;
    return (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.label.localeCompare(b.label);
  });
}

function signedValueClass(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "text-ink-2";
  return value > 0 ? "text-[var(--positive)]" : "text-[var(--negative)]";
}

function formatSignedCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const formatted = formatCurrency(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatShortDate(value: string | number | null | undefined) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value > 100000000000 ? value : value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function roundSvg(value: number) {
  return Math.round(value * 10) / 10;
}

function LeaderSkeletonRow({ index }: { index: number }) {
  return (
    <div
      className="row-hover grid items-center gap-3 border-b border-dashed border-ink-3 px-3 py-3 last:border-b-0"
      style={{ gridTemplateColumns: "42px 44px 1fr 128px 84px 100px 160px 86px" }}
    >
      <span className="font-mono text-[12px] text-ink-3">{String(index + 1).padStart(2, "0")}</span>
      <span className="h-6 w-6 border border-ink-3" />
      <SkeletonLine width={index % 2 === 0 ? "70%" : "56%"} />
      <SkeletonLine width="76%" accent={index < 3} />
      <SkeletonLine width="42%" />
      <SkeletonLine width="60%" />
      <SparkLine up={index < 5} width={120} />
      <SkeletonLine width="42px" />
    </div>
  );
}

function TableHeader({
  columns,
  children,
}: {
  columns: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3"
      style={{ gridTemplateColumns: columns }}
    >
      {children}
    </div>
  );
}

function SkeletonLine({
  width,
  height = "10px",
  accent = false,
}: {
  width: string;
  height?: string;
  accent?: boolean;
}) {
  return (
    <span
      className={accent ? "skeleton-shimmer block bg-accent/70" : "skeleton-shimmer block bg-ink-3"}
      style={{ width, height }}
    />
  );
}
