"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow, Frame, Pill, StatCard } from "@/components/ui";
import { NavBar } from "@/components/NavBar";
import {
  fetchMarkets,
  formatCurrency,
  formatEntry,
  formatPercent,
  leadingOutcome,
  pricePercent,
  readSnapshot,
  relativeTime,
  saveSnapshot,
  specialistCount,
  type SmartMoneyMarket,
} from "@/lib/smartMoney";

type SortMode = "volume" | "specialists" | "skew";

export function MarketsDashboard() {
  const [markets, setMarkets] = useState<SmartMoneyMarket[]>([]);
  const [registryRefreshedAt, setRegistryRefreshedAt] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const [query, setQuery] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

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

  const visibleMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return markets
      .filter((market) => {
        if (category !== "all" && !market.parentTags.includes(category)) return false;
        if (!normalizedQuery) return true;
        return `${market.question} ${market.marketSlug} ${market.parentTags.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortMode === "specialists") return specialistCount(b) - specialistCount(a);
        if (sortMode === "skew") return Math.abs(priceSkew(b)) - Math.abs(priceSkew(a));
        return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      });
  }, [category, markets, query, sortMode]);

  const readyMarkets = markets.filter((market) => market.outcomes.length > 0);
  const hasMarkets = markets.length > 0;
  const trackedWallets = new Set(
    markets.flatMap((market) =>
      market.outcomes.flatMap((outcome) => outcome.topSpecialists.map((specialist) => specialist.wallet)),
    ),
  );
  const topSignal = [...readyMarkets].sort((a, b) => specialistCount(b) - specialistCount(a))[0];
  const selectedMarket = markets.find((market) => market.conditionId === selectedMarketId) ?? null;

  return (
    <Frame>
      <NavBar />

      <main className="px-4 py-5 sm:px-5 md:px-8 md:py-7">
        <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-[6px]">
            <Eyebrow>{"// MARKETS ▸ SMART-MONEY SIGNAL"}</Eyebrow>
            <h1 className="font-mono text-[19px] font-medium uppercase leading-tight tracking-[1px] text-ink sm:text-[21px] md:text-[24px]">
              PREF · POLYMARKET
            </h1>
            <p className="max-w-[760px] font-mono text-[12px] leading-relaxed text-ink-2">
              Specialist positioning, public odds, and market volume in one view.
            </p>
          </div>

          <div className="-mx-4 flex overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap">
            {categories.map((item) => (
              <button key={item} type="button" onClick={() => setCategory(item)} className="shrink-0">
                <Pill tone={category === item ? "accent" : "ink"}>{item}</Pill>
              </button>
            ))}
            </div>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="markets scanned" value={hasMarkets ? String(markets.length) : "--"} />
          <StatCard label="with specialist signal" value={hasMarkets ? String(readyMarkets.length) : "--"} highlight />
          <StatCard label="tracked wallets" value={hasMarkets ? String(trackedWallets.size) : "--"} />
          <StatCard label="latest snapshot" value={hasMarkets ? relativeTime(registryRefreshedAt) : "--"} highlight />
        </section>

        <section className="mb-5 flex flex-col gap-3 border-y border-dashed border-ink-3 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
              strongest visible signal
            </span>
            <span className="truncate font-mono text-[13px] text-ink">
              {topSignal?.headline ?? "Signal surface ready"}
            </span>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets"
              className="h-9 w-full border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none placeholder:text-ink-3 focus:border-accent sm:h-8 sm:w-[260px]"
            />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-9 border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none focus:border-accent sm:h-8"
            >
              <option value="volume">volume</option>
              <option value="specialists">specialists</option>
              <option value="skew">price skew</option>
            </select>
          </div>
        </section>

        {visibleMarkets.length > 0 ? (
          <section className="grid gap-[14px] xl:grid-cols-2">
            {visibleMarkets.map((market) => (
              <MarketCard
                key={market.conditionId}
                market={market}
                selected={selectedMarketId === market.conditionId}
                onSelect={() => setSelectedMarketId(market.conditionId)}
              />
            ))}
          </section>
        ) : (
          <EmptyMarketSurface />
        )}
      </main>

      {selectedMarket ? (
        <MarketDetailPanel market={selectedMarket} onClose={() => setSelectedMarketId(null)} />
      ) : null}
    </Frame>
  );
}

function MarketCard({
  market,
  selected,
  onSelect,
}: {
  market: SmartMoneyMarket;
  selected: boolean;
  onSelect: () => void;
}) {
  const primaryPrice = Object.entries(market.currentPrices)[0];
  const secondaryPrice = Object.entries(market.currentPrices)[1];
  const lead = leadingOutcome(market);
  const specialists = market.outcomes.flatMap((outcome) => outcome.topSpecialists).slice(0, 4);
  const yesWidth = pricePercent(primaryPrice?.[1]);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={clsx(
        "flex cursor-pointer flex-col gap-4 border border-ink-3 bg-paper-2 p-4 outline-none transition-colors hover:border-accent focus:border-accent",
        lead ? "border-l-2 border-l-accent bg-[rgba(96,165,250,0.045)]" : "",
        selected ? "border-accent" : "",
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1">
              {market.parentTags.slice(0, 3).map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
              {market.parentTags.length === 0 ? <Pill>market</Pill> : null}
            </div>
            <h2 className="font-mono text-[15px] leading-snug text-ink md:text-[16px]">
              {market.question}
            </h2>
          </div>
          <a
            href={`/api/smart-money/share/${encodeURIComponent(market.conditionId)}.png`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="shrink-0 border border-ink-3 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.7px] text-ink-2 hover:border-accent hover:text-accent"
          >
            share
          </a>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[1px]">
            <span className="text-accent">
              {primaryPrice ? `${primaryPrice[0]} ${Math.round(primaryPrice[1] * 100)}c` : "primary"}
            </span>
            <span className="text-ink-2">
              {secondaryPrice ? `${secondaryPrice[0]} ${Math.round(secondaryPrice[1] * 100)}c` : ""}
            </span>
          </div>
          <div className="flex h-1 overflow-hidden bg-ink-bg-soft">
            <div className="h-full bg-accent" style={{ width: `${yesWidth}%` }} />
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="smart-money lean" value={lead ? `${lead.outcome} · ${lead.specialistCount}` : "watching"} />
        <Metric label="avg entry" value={formatEntry(lead?.weightedAverageEntry)} />
        <Metric label="24h volume" value={formatCurrency(market.volume24h)} />
      </div>

      {specialists.length > 0 ? (
        <div className="overflow-x-auto border border-ink-3">
          <div className="min-w-[420px]">
            <div className="grid grid-cols-[1fr_74px_70px_54px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
              <span>wallet</span>
              <span>outcome</span>
              <span>pnl</span>
              <span>roi</span>
            </div>
            {specialists.map((specialist) => (
              <div
                key={`${market.conditionId}-${specialist.wallet}-${specialist.currentOutcome}`}
                className="grid grid-cols-[1fr_74px_70px_54px] gap-3 border-b border-dashed border-ink-3 px-3 py-2 last:border-b-0"
              >
                <span className="truncate font-mono text-[11px] text-ink">{specialist.displayLabel}</span>
                <span className="font-mono text-[10px] uppercase text-accent">{specialist.currentOutcome}</span>
                <span className="font-mono text-[10px] text-ink-2">{formatCurrency(specialist.realizedPnl)}</span>
                <span className="font-mono text-[10px] text-ink-2">{formatPercent(specialist.roi)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
        <span>{market.marketSlug}</span>
        <span>positions {relativeTime(market.marketDataRefreshedAt)}</span>
      </footer>
    </article>
  );
}

function MarketDetailPanel({
  market,
  onClose,
}: {
  market: SmartMoneyMarket;
  onClose: () => void;
}) {
  const prices = Object.entries(market.currentPrices);
  const lead = leadingOutcome(market);
  const specialists = market.outcomes.flatMap((outcome) =>
    outcome.topSpecialists.map((specialist) => ({
      ...specialist,
      outcome,
    })),
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-black/55 p-0 sm:p-4" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-[760px] flex-col border-l border-ink-3 bg-paper text-ink shadow-none sm:border sm:bg-paper-2"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-3 bg-paper-2 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1">
              {market.parentTags.slice(0, 4).map((tag) => (
                <Pill key={tag}>{tag}</Pill>
              ))}
              {market.parentTags.length === 0 ? <Pill>market</Pill> : null}
            </div>
            <h2 className="font-mono text-[16px] leading-snug text-ink sm:text-[18px]">
              {market.question}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-ink-3 px-2 py-1 font-mono text-[11px] uppercase tracking-[1px] text-ink-2 hover:border-accent hover:text-accent"
          >
            close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            <Metric label="smart-money lean" value={lead ? `${lead.outcome} · ${lead.specialistCount}` : "watching"} />
            <Metric label="avg entry" value={formatEntry(lead?.weightedAverageEntry)} />
            <Metric label="24h volume" value={formatCurrency(market.volume24h)} />
          </section>

          <section className="mb-4 border border-ink-3 bg-ink-bg-soft p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
                public odds
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
                positions {relativeTime(market.marketDataRefreshedAt)}
              </span>
            </div>
            <div className="grid gap-3">
              {prices.map(([outcome, price]) => (
                <div key={outcome} className="grid gap-1">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[1px]">
                    <span className="text-ink">{outcome}</span>
                    <span className="text-accent">{Math.round(price * 100)}c</span>
                  </div>
                  <div className="h-1 bg-paper">
                    <div className="h-full bg-accent" style={{ width: `${pricePercent(price)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-4 border border-ink-3 bg-paper-2">
            <div className="border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
              specialist split
            </div>
            {market.outcomes.length > 0 ? (
              <div className="grid gap-2 p-3">
                {market.outcomes.map((outcome) => (
                  <div
                    key={outcome.outcome}
                    className="grid gap-2 border border-dashed border-ink-3 bg-paper px-3 py-2 sm:grid-cols-[88px_1fr_92px]"
                  >
                    <span className="font-mono text-[11px] uppercase text-accent">{outcome.outcome}</span>
                    <span className="font-mono text-[11px] text-ink-2">
                      {outcome.specialistCount} wallets · {formatCurrency(outcome.totalCurrentSize)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-2">
                      avg {formatEntry(outcome.weightedAverageEntry)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 font-mono text-[11px] uppercase tracking-[1px] text-ink-3">
                watching
              </div>
            )}
          </section>

          {specialists.length > 0 ? (
            <section className="overflow-x-auto border border-ink-3 bg-paper-2">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[1fr_86px_90px_86px_70px_72px] gap-3 border-b border-ink-3 bg-ink-bg-soft px-3 py-2 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
                  <span>wallet</span>
                  <span>outcome</span>
                  <span>size</span>
                  <span>entry</span>
                  <span>pnl</span>
                  <span>roi</span>
                </div>
                {specialists.map((specialist) => (
                  <div
                    key={`${specialist.wallet}-${specialist.currentOutcome}-${specialist.currentSize}`}
                    className="grid grid-cols-[1fr_86px_90px_86px_70px_72px] gap-3 border-b border-dashed border-ink-3 px-3 py-2 last:border-b-0"
                  >
                    <span className="truncate font-mono text-[11px] text-ink">{specialist.displayLabel}</span>
                    <span className="font-mono text-[10px] uppercase text-accent">{specialist.currentOutcome}</span>
                    <span className="font-mono text-[10px] text-ink-2">{formatCurrency(specialist.currentSize)}</span>
                    <span className="font-mono text-[10px] text-ink-2">{formatEntry(specialist.averageEntry)}</span>
                    <span className="font-mono text-[10px] text-ink-2">{formatCurrency(specialist.realizedPnl)}</span>
                    <span className="font-mono text-[10px] text-ink-2">{formatPercent(specialist.roi)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-ink-3 bg-paper-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
            {market.marketSlug}
          </span>
          <a
            href={`/api/smart-money/share/${encodeURIComponent(market.conditionId)}.png`}
            target="_blank"
            rel="noreferrer"
            className="border border-accent bg-[rgba(96,165,250,0.08)] px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[1px] text-accent hover:bg-[rgba(96,165,250,0.14)]"
          >
            share market
          </a>
        </footer>
      </aside>
    </div>
  );
}

function EmptyMarketSurface() {
  const rows = ["market", "odds", "specialists", "entry", "volume"];

  return (
    <section className="border border-dashed border-ink-3 bg-paper-2">
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-h-[260px] flex-col justify-between border border-ink-3 bg-paper p-4">
          <div className="flex items-center justify-between border-b border-dashed border-ink-3 pb-3">
            <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-accent">
              signal surface
            </span>
            <span className="h-2 w-2 bg-accent" aria-hidden="true" />
          </div>
          <div className="grid gap-3 py-6">
            {rows.map((row, index) => (
              <div
                key={row}
                className="grid grid-cols-[86px_1fr] items-center gap-3 sm:grid-cols-[112px_1fr]"
              >
                <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">
                  {row}
                </span>
                <span
                  className={clsx(
                    "block h-2 border border-ink-3 bg-ink-bg-soft",
                    index % 2 === 0 ? "w-full" : "w-2/3",
                  )}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
        </div>

        <div className="grid content-between gap-4 border border-ink-3 bg-ink-bg-soft p-4">
          <div>
            <div className="mb-3 font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
              specialist table
            </div>
            <div className="grid gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[1fr_52px] gap-3 border-b border-dashed border-ink-3 pb-2">
                  <span className={clsx("h-2 bg-paper", index % 3 === 0 ? "w-5/6" : "w-2/3")} />
                  <span className="h-2 bg-paper" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-24 border border-dashed border-ink-3 bg-paper" />
        </div>
      </div>
    </section>
  );
}

function SkeletonMetric() {
  return (
    <div className="border border-dashed border-ink-3 bg-ink-bg-soft p-3">
      <div className="mb-2 h-2 w-2/3 bg-paper" />
      <div className="h-3 w-1/2 bg-paper" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-dashed border-ink-3 bg-ink-bg-soft px-3 py-2">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{label}</div>
      <div className="truncate font-mono text-[13px] uppercase text-ink">{value}</div>
    </div>
  );
}

function priceSkew(market: SmartMoneyMarket) {
  const prices = Object.values(market.currentPrices);
  if (prices.length < 2) return 0;
  return prices[0] - prices[1];
}
