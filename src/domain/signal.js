export const PARENT_CATEGORIES = [
  "politics",
  "sports",
  "weather",
  "crypto",
  "macro",
  "sci-tech",
];

const TAG_RULES = [
  ["politics", /\b(election|president|senate|congress|trump|biden|government|politic|us election)\b/i],
  ["sports", /\b(nba|nfl|mlb|nhl|soccer|football|ufc|tennis|sports?)\b/i],
  ["weather", /\b(weather|hurricane|temperature|rain|snow|storm|climate)\b/i],
  ["crypto", /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol|xrp|doge)\b/i],
  ["macro", /\b(fed|federal reserve|inflation|cpi|gdp|rates?|macro|economy|unemployment)\b/i],
  ["sci-tech", /\b(ai|openai|space|spacex|science|technology|tech|nasa|robot|chip)\b/i],
];

export const DEFAULT_THRESHOLDS = {
  politics: { minPnl: 750, minRoi: 0.08, minClosedMarkets: 4 },
  sports: { minPnl: 500, minRoi: 0.07, minClosedMarkets: 5 },
  weather: { minPnl: 200, minRoi: 0.06, minClosedMarkets: 3 },
  crypto: { minPnl: 700, minRoi: 0.08, minClosedMarkets: 4 },
  macro: { minPnl: 500, minRoi: 0.07, minClosedMarkets: 3 },
  "sci-tech": { minPnl: 200, minRoi: 0.06, minClosedMarkets: 2 },
};

export function normalizeParentTags(rawTags) {
  const categories = [];
  for (const rawTag of rawTags ?? []) {
    const tag = String(rawTag);
    for (const [category, pattern] of TAG_RULES) {
      if (pattern.test(tag) && !categories.includes(category)) {
        categories.push(category);
      }
    }
  }
  return categories;
}

export function truncateWallet(wallet) {
  if (!wallet || wallet.length <= 12) return wallet ?? "";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function isBtcUpDownMarket(market) {
  const title = `${market?.question ?? ""} ${market?.title ?? ""}`;
  const rawTags = (market?.rawTags ?? market?.tags ?? []).join(" ");
  const text = `${title} ${rawTags}`;
  return /\b(btc|bitcoin)\b/i.test(text) && /\b(up|down|above|below|15m|hour|hourly|daily)\b/i.test(text);
}

export function qualifiesAsSpecialist(metrics, thresholds = DEFAULT_THRESHOLDS) {
  const threshold = thresholds[metrics.category];
  if (!threshold) return false;
  return (
    metrics.realizedPnl >= threshold.minPnl &&
    metrics.roi >= threshold.minRoi &&
    metrics.closedMarkets >= threshold.minClosedMarkets
  );
}

export function buildRegistryRecords({ wallets, positions, marketTags, thresholds = DEFAULT_THRESHOLDS, refreshedAt }) {
  const byWalletCategory = new Map();

  for (const position of positions) {
    if (!position.closed || typeof position.realizedPnl !== "number") continue;
    const rawTags = marketTags[position.marketId] ?? [];
    const categories = normalizeParentTags(rawTags);
    for (const category of categories) {
      const key = `${position.wallet.toLowerCase()}|${category}`;
      const current = byWalletCategory.get(key) ?? {
        wallet: position.wallet,
        category,
        realizedPnl: 0,
        totalVolume: 0,
        closedMarkets: new Set(),
        last90dPnl: 0,
        candidateSources: new Set(),
      };
      current.realizedPnl += position.realizedPnl;
      current.totalVolume += Math.max(0, position.volume ?? 0);
      current.closedMarkets.add(position.marketId);
      if (position.isRecent90d) current.last90dPnl += position.realizedPnl;
      for (const source of wallets[position.wallet]?.candidateSources ?? []) current.candidateSources.add(source);
      byWalletCategory.set(key, current);
    }
  }

  return [...byWalletCategory.values()].map((record) => {
    const roi = record.totalVolume > 0 ? record.realizedPnl / record.totalVolume : 0;
    const metrics = {
      wallet: record.wallet,
      category: record.category,
      realizedPnl: round(record.realizedPnl),
      totalVolume: round(record.totalVolume),
      roi: round(roi),
      closedMarkets: record.closedMarkets.size,
      last90dPnl: round(record.last90dPnl),
      last90dRoi: null,
      knownHandle: wallets[record.wallet]?.knownHandle ?? null,
      candidateSources: [...record.candidateSources],
      thresholdVersion: "v1-demo",
      registryRefreshedAt: refreshedAt,
    };
    return { ...metrics, qualifies: qualifiesAsSpecialist(metrics, thresholds) };
  });
}

export function summarizeMarketScan({ market, registry, holders, holderFetchedAt, registryRefreshedAt }) {
  const parentTags = normalizeParentTags(market.rawTags);
  if (parentTags.length === 0) {
    return baseMarketResult(market, parentTags, "market_metadata_unavailable", registryRefreshedAt, holderFetchedAt);
  }

  const relevantSpecialists = registry.filter(
    (record) => record.qualifies && parentTags.includes(record.category),
  );
  if (relevantSpecialists.length < 1) {
    return baseMarketResult(market, parentTags, "insufficient_category_data", registryRefreshedAt, holderFetchedAt);
  }

  const specialistByWallet = new Map(relevantSpecialists.map((record) => [record.wallet.toLowerCase(), record]));
  const counted = holders
    .map((holder) => ({ holder, specialist: specialistByWallet.get(holder.wallet.toLowerCase()) }))
    .filter((row) => row.specialist);

  if (counted.length === 0) {
    return baseMarketResult(market, parentTags, "no_specialists_currently_holding", registryRefreshedAt, holderFetchedAt);
  }

  const byOutcome = new Map();
  for (const { holder, specialist } of counted) {
    const summary = byOutcome.get(holder.outcome) ?? {
      outcome: holder.outcome,
      specialistCount: 0,
      totalCurrentSize: 0,
      weightedEntryNumerator: 0,
      weightedEntryWeight: 0,
      topSpecialists: [],
    };
    summary.specialistCount += 1;
    summary.totalCurrentSize += holder.size ?? 0;
    if (typeof holder.averageEntry === "number" && typeof holder.size === "number") {
      summary.weightedEntryNumerator += holder.averageEntry * holder.size;
      summary.weightedEntryWeight += holder.size;
    }
    summary.topSpecialists.push({
      wallet: specialist.wallet,
      displayLabel: specialist.knownHandle ?? truncateWallet(specialist.wallet),
      knownHandle: specialist.knownHandle,
      category: specialist.category,
      currentOutcome: holder.outcome,
      currentSize: holder.size ?? null,
      averageEntry: holder.averageEntry ?? null,
      realizedPnl: specialist.realizedPnl,
      roi: specialist.roi,
      closedMarkets: specialist.closedMarkets,
      last90dPnl: specialist.last90dPnl,
    });
    byOutcome.set(holder.outcome, summary);
  }

  const outcomes = [...byOutcome.values()].map((summary) => ({
    outcome: summary.outcome,
    specialistCount: summary.specialistCount,
    totalCurrentSize: round(summary.totalCurrentSize),
    weightedAverageEntry:
      summary.weightedEntryWeight > 0 ? round(summary.weightedEntryNumerator / summary.weightedEntryWeight) : null,
    averageEntryStatus: summary.weightedEntryWeight > 0 ? "available" : "unavailable",
    topSpecialists: summary.topSpecialists.sort((a, b) => b.realizedPnl - a.realizedPnl).slice(0, 5),
  }));

  return {
    ...baseMarketResult(market, parentTags, "ready", registryRefreshedAt, holderFetchedAt),
    outcomes: outcomes.sort((a, b) => b.specialistCount - a.specialistCount),
  };
}

export function buildHeadline(scan) {
  if (scan.status === "insufficient_category_data") return `Insufficient ${scan.parentTags[0] ?? "category"} specialist data`;
  if (scan.status === "no_specialists_currently_holding") return "No tracked specialists currently holding";
  if (scan.status !== "ready" || scan.outcomes.length === 0) return "Specialist signal unavailable";
  const dominant = scan.outcomes[0];
  const entry =
    dominant.weightedAverageEntry === null ? "avg entry unavailable" : `avg ${Math.round(dominant.weightedAverageEntry * 100)}c`;
  return `${dominant.specialistCount} ${scan.parentTags[0]} specialists ${dominant.outcome} @ ${entry}`;
}

function baseMarketResult(market, parentTags, status, registryRefreshedAt, marketDataRefreshedAt) {
  return {
    conditionId: market.conditionId,
    marketSlug: market.slug ?? null,
    question: market.question,
    currentPrices: market.currentPrices,
    parentTags,
    volume24h: market.volume24h ?? null,
    outcomes: [],
    status,
    registryRefreshedAt,
    marketDataRefreshedAt,
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
