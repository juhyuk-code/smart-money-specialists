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
  const trackedWallets = new Set(
    markets.flatMap((market) =>
      market.outcomes.flatMap((outcome) => outcome.topSpecialists.map((specialist) => specialist.wallet)),
    ),
  );
  const topSignal = [...readyMarkets].sort((a, b) => specialistCount(b) - specialistCount(a))[0];

  return (
    <Frame>
      <NavBar />

      <main className="px-5 py-5 md:px-8 md:py-7">
        <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-[6px]">
            <Eyebrow>{"// MARKETS ▸ SMART-MONEY SIGNAL"}</Eyebrow>
            <h1 className="font-mono text-[20px] font-medium uppercase leading-tight tracking-[1px] text-ink md:text-[24px]">
              SMART MONEY · POLYMARKET
            </h1>
            <p className="max-w-[760px] font-mono text-[12px] leading-relaxed text-ink-2">
              Specialist positioning, public odds, and market volume in one view.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.map((item) => (
              <button key={item} type="button" onClick={() => setCategory(item)}>
                <Pill tone={category === item ? "accent" : "ink"}>{item}</Pill>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="markets scanned" value={String(markets.length)} />
          <StatCard label="with specialist signal" value={String(readyMarkets.length)} highlight />
          <StatCard label="tracked wallets" value={String(trackedWallets.size)} />
          <StatCard label="latest snapshot" value={relativeTime(registryRefreshedAt)} highlight />
        </section>

        <section className="mb-5 flex flex-col gap-3 border-y border-dashed border-ink-3 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-ink-3">
              strongest visible signal
            </span>
            <span className="truncate font-mono text-[13px] text-ink">
              {topSignal?.headline ?? "Market snapshot warming up"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search markets"
              className="h-8 w-full border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none placeholder:text-ink-3 focus:border-accent sm:w-[260px]"
            />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-8 border border-ink-3 bg-paper-2 px-3 font-mono text-[11px] uppercase tracking-[0.6px] text-ink outline-none focus:border-accent"
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
              <MarketCard key={market.conditionId} market={market} />
            ))}
          </section>
        ) : (
          <section className="border border-dashed border-ink-3 bg-paper-2 px-5 py-12 text-center">
            <span className="font-mono text-[12px] uppercase tracking-[1px] text-ink-2">
              Market snapshot warming up
            </span>
          </section>
        )}
      </main>
    </Frame>
  );
}

function MarketCard({ market }: { market: SmartMoneyMarket }) {
  const primaryPrice = Object.entries(market.currentPrices)[0];
  const secondaryPrice = Object.entries(market.currentPrices)[1];
  const lead = leadingOutcome(market);
  const specialists = market.outcomes.flatMap((outcome) => outcome.topSpecialists).slice(0, 4);
  const yesWidth = pricePercent(primaryPrice?.[1]);

  return (
    <article
      className={clsx(
        "flex flex-col gap-4 border border-ink-3 bg-paper-2 p-4",
        lead ? "border-l-2 border-l-accent bg-[rgba(96,165,250,0.045)]" : "",
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
        <div className="overflow-hidden border border-ink-3">
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
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.8px] text-ink-3">
        <span>{market.marketSlug}</span>
        <span>positions {relativeTime(market.marketDataRefreshedAt)}</span>
      </footer>
    </article>
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
