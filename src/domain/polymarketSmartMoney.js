import { truncateWallet } from "./signal.js";

export const CATEGORY_TAXONOMY = [
  "politics",
  "sports",
  "weather",
  "crypto",
  "macro",
  "sci-tech",
  "culture",
  "other",
];

export const LABEL_WEIGHTS = {
  proven_specialist: 1,
  emerging_specialist: 0.5,
  one_hit_wonder: 0,
  generalist: 0,
  observed_unclassified: 0,
};

export const REGISTRY_THRESHOLDS = {
  proven: {
    minResolvedMarkets: 8,
    minResolvedNotional: 1000,
    minRealizedPnl: 500,
    minRoi: 0.05,
    minWinRate: 0.55,
    maxTopGainConcentration: 0.5,
  },
  emerging: {
    minResolvedMarkets: 3,
    maxResolvedMarkets: 7,
    minResolvedNotional: 500,
    minRealizedPnl: 100,
    minRoi: 0.05,
    minWinRate: 0.55,
    maxTopGainConcentration: 0.7,
  },
  oneHit: {
    maxResolvedMarkets: 4,
    minTopGainConcentration: 0.65,
  },
  generalist: {
    minProfitableCategories: 3,
    minResolvedMarkets: 15,
    minRoi: 0.03,
    maxCategoryProfitShare: 0.5,
  },
};

const CATEGORY_RULES = [
  ["politics", /\b(election|president|senate|congress|trump|biden|government|politic|minister|parliament|supreme court|approval)\b/i],
  ["sports", /\b(nba|nfl|mlb|nhl|soccer|football|ufc|tennis|golf|f1|formula 1|championship|playoff|sports?)\b/i],
  ["weather", /\b(weather|hurricane|temperature|rain|snow|storm|tornado|climate|wildfire|earthquake)\b/i],
  ["crypto", /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol|xrp|doge|token|stablecoin)\b/i],
  ["macro", /\b(fed|federal reserve|inflation|cpi|gdp|rates?|economy|economic|unemployment|recession|tariff|treasury|yield)\b/i],
  ["sci-tech", /\b(ai|openai|space|spacex|science|technology|tech|nasa|robot|chip|semiconductor|apple|tesla|nvidia)\b/i],
  ["culture", /\b(oscar|grammy|emmy|movie|music|album|song|box office|celebrity|culture|entertainment|tv|streaming|game awards)\b/i],
];

const PRIMARY_LABELS = new Set(["proven_specialist", "emerging_specialist"]);
const SECONDARY_LABELS = new Set(["one_hit_wonder"]);
const HOLDER_STALE_MS = 5 * 60 * 1000;
const REGISTRY_STALE_MS = 36 * 60 * 60 * 1000;

export function normalizeWallet(value) {
  if (!value) return null;
  const wallet = String(value).trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : null;
}

export function normalizeCategories(input) {
  const text = [
    input?.question,
    input?.title,
    input?.slug,
    input?.eventSlug,
    ...(input?.tags ?? []),
    ...(input?.rawTags ?? []),
  ]
    .filter(Boolean)
    .map((item) => tagText(item))
    .join(" ");

  const categories = [];
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text) && !categories.includes(category)) categories.push(category);
  }
  return categories.length > 0 ? categories : ["other"];
}

export function classifyCategoryPerformance(metrics, thresholds = REGISTRY_THRESHOLDS) {
  const concentration = metrics.topGainConcentration ?? 0;
  const proven = thresholds.proven;
  if (
    metrics.resolvedMarketCount >= proven.minResolvedMarkets &&
    metrics.resolvedNotional >= proven.minResolvedNotional &&
    metrics.realizedPnl >= proven.minRealizedPnl &&
    metrics.roi >= proven.minRoi &&
    metrics.winRate >= proven.minWinRate &&
    concentration <= proven.maxTopGainConcentration
  ) {
    return "proven_specialist";
  }

  if (
    metrics.realizedPnl > 0 &&
    (metrics.resolvedMarketCount <= thresholds.oneHit.maxResolvedMarkets ||
      concentration > thresholds.oneHit.minTopGainConcentration)
  ) {
    return "one_hit_wonder";
  }

  const emerging = thresholds.emerging;
  if (
    metrics.resolvedMarketCount >= emerging.minResolvedMarkets &&
    metrics.resolvedMarketCount <= emerging.maxResolvedMarkets &&
    metrics.resolvedNotional >= emerging.minResolvedNotional &&
    metrics.realizedPnl >= emerging.minRealizedPnl &&
    metrics.roi >= emerging.minRoi &&
    metrics.winRate >= emerging.minWinRate &&
    concentration <= emerging.maxTopGainConcentration
  ) {
    return "emerging_specialist";
  }

  return "observed_unclassified";
}

export function classifyWalletLabel(categoryPerformances, thresholds = REGISTRY_THRESHOLDS) {
  const profitable = categoryPerformances.filter((item) => item.realizedPnl > 0);
  const totalResolvedMarkets = sum(categoryPerformances.map((item) => item.resolvedMarketCount));
  const totalNotional = sum(categoryPerformances.map((item) => item.resolvedNotional));
  const totalPnl = sum(categoryPerformances.map((item) => item.realizedPnl));
  const totalPositivePnl = sum(profitable.map((item) => item.realizedPnl));
  const topCategoryPnl = Math.max(0, ...profitable.map((item) => item.realizedPnl));
  const roi = totalNotional > 0 ? totalPnl / totalNotional : 0;
  const topShare = totalPositivePnl > 0 ? topCategoryPnl / totalPositivePnl : 1;

  if (
    profitable.length >= thresholds.generalist.minProfitableCategories &&
    totalResolvedMarkets >= thresholds.generalist.minResolvedMarkets &&
    roi >= thresholds.generalist.minRoi &&
    topShare <= thresholds.generalist.maxCategoryProfitShare
  ) {
    return "generalist";
  }

  return "observed_unclassified";
}

export function buildWalletCategoryPerformance({ wallet, closedPositions, marketMetadataByConditionId = new Map() }) {
  const normalizedWallet = normalizeWallet(wallet);
  const byCategory = new Map();

  for (const position of closedPositions ?? []) {
    const conditionId = position.conditionId;
    const market = conditionId ? marketMetadataByConditionId.get(conditionId) : null;
    const categories = normalizeCategories({
      question: market?.question ?? position.title,
      title: position.title,
      slug: market?.marketSlug ?? market?.slug ?? position.slug,
      eventSlug: position.eventSlug,
      tags: market?.tags ?? market?.rawTags ?? position.tags ?? [],
    });
    const marketKey = conditionId ?? `${position.slug ?? position.title}:${position.outcome ?? ""}`;
    const pnl = toNumber(position.realizedPnl) ?? 0;
    const notional = Math.max(0, toNumber(position.totalBought) ?? toNumber(position.resolvedNotional) ?? 0);
    const activeAt = normalizeDate(position.timestamp ?? position.endDate);

    for (const category of categories) {
      const current = byCategory.get(category) ?? {
        wallet: normalizedWallet ?? wallet,
        category,
        realizedPnl: 0,
        resolvedNotional: 0,
        markets: new Map(),
        lastActiveDate: null,
      };
      current.realizedPnl += pnl;
      current.resolvedNotional += notional;
      const marketRecord = current.markets.get(marketKey) ?? { pnl: 0, notional: 0 };
      marketRecord.pnl += pnl;
      marketRecord.notional += notional;
      current.markets.set(marketKey, marketRecord);
      current.lastActiveDate = maxIsoDate(current.lastActiveDate, activeAt);
      byCategory.set(category, current);
    }
  }

  return Array.from(byCategory.values()).map((item) => {
    const marketPnls = Array.from(item.markets.values()).map((market) => market.pnl);
    const positivePnls = marketPnls.filter((value) => value > 0);
    const totalPositivePnl = sum(positivePnls);
    const topGain = Math.max(0, ...positivePnls);
    const resolvedMarketCount = item.markets.size;
    const metrics = {
      wallet: item.wallet,
      category: item.category,
      realizedPnl: round(item.realizedPnl),
      winRate: resolvedMarketCount > 0 ? round(marketPnls.filter((value) => value > 0).length / resolvedMarketCount) : 0,
      resolvedMarketCount,
      resolvedNotional: round(item.resolvedNotional),
      roi: item.resolvedNotional > 0 ? round(item.realizedPnl / item.resolvedNotional) : 0,
      lastActiveDate: item.lastActiveDate,
      topGainConcentration: totalPositivePnl > 0 ? round(topGain / totalPositivePnl) : 0,
    };
    return {
      ...metrics,
      label: classifyCategoryPerformance(metrics),
    };
  });
}

export function buildMarketIntelligence({
  market,
  positions,
  categoryPerformance,
  registryRefreshedAt,
  holderSnapshotAt,
  now = new Date(),
}) {
  const categories = market.parentTags?.length ? market.parentTags : normalizeCategories(market);
  const relevantRecords = categoryPerformance.filter((record) => categories.includes(record.category));
  const recordByWallet = buildBestRecordIndex(relevantRecords);
  const primary = [];
  const secondary = [];
  const labelBreakdown = {};

  for (const position of positions ?? []) {
    const wallet = normalizeWallet(position.wallet ?? position.proxyWallet);
    if (!wallet) continue;
    const record = recordByWallet.get(wallet);
    if (!record) continue;
    const signalWallet = buildSignalWallet({ position, record });
    labelBreakdown[record.label] = (labelBreakdown[record.label] ?? 0) + 1;
    if (PRIMARY_LABELS.has(record.label)) primary.push(signalWallet);
    else if (SECONDARY_LABELS.has(record.label)) secondary.push(signalWallet);
  }

  const outcomes = buildOutcomeSummaries(primary);
  const smartGap = buildSmartGap({ outcomes, currentPrices: market.currentPrices });
  const dataQuality = buildDataQuality({
    categories,
    relevantRecords,
    primary,
    secondary,
    outcomes,
    registryRefreshedAt,
    holderSnapshotAt,
    now,
  });

  return {
    conditionId: market.conditionId,
    marketSlug: market.marketSlug ?? market.slug ?? null,
    question: market.question,
    currentPrices: market.currentPrices ?? {},
    parentTags: categories,
    volume24h: market.volume24h ?? null,
    outcomes,
    status: dataQuality.status,
    registryRefreshedAt,
    marketDataRefreshedAt: holderSnapshotAt,
    holderSnapshotAt,
    smartGap,
    labelBreakdown,
    primarySignalWallets: sortSignalWallets(primary).slice(0, 12),
    secondarySignalWallets: sortSignalWallets(secondary).slice(0, 12),
    dataQuality,
    headline: buildIntelligenceHeadline({ outcomes, categories, dataQuality }),
  };
}

export function labelWeight(label) {
  return LABEL_WEIGHTS[label] ?? 0;
}

export function priceForOutcome(currentPrices, outcome) {
  const normalized = String(outcome ?? "").toLowerCase();
  const exact = Object.entries(currentPrices ?? {}).find(([key]) => key.toLowerCase() === normalized);
  return toNumber(exact?.[1]) ?? null;
}

function buildBestRecordIndex(records) {
  const order = {
    proven_specialist: 5,
    emerging_specialist: 4,
    one_hit_wonder: 3,
    generalist: 2,
    observed_unclassified: 1,
  };
  const index = new Map();
  for (const record of records) {
    const wallet = normalizeWallet(record.wallet);
    if (!wallet) continue;
    const current = index.get(wallet);
    if (!current || (order[record.label] ?? 0) > (order[current.label] ?? 0)) {
      index.set(wallet, record);
    }
  }
  return index;
}

function buildSignalWallet({ position, record }) {
  const metrics = record.metrics ?? record;
  const wallet = normalizeWallet(position.wallet ?? position.proxyWallet) ?? position.wallet;
  return {
    wallet,
    displayLabel: position.displayLabel ?? position.name ?? position.pseudonym ?? truncateWallet(wallet),
    knownHandle: position.knownHandle ?? null,
    category: record.category,
    label: record.label,
    labelWeight: labelWeight(record.label),
    currentOutcome: position.outcome,
    currentSize: toNumber(position.size) ?? 0,
    averageEntry: toNumber(position.averageEntry ?? position.avgPrice),
    realizedPnl: toNumber(metrics.realizedPnl),
    roi: toNumber(metrics.roi),
    closedMarkets: toNumber(metrics.resolvedMarketCount),
    resolvedNotional: toNumber(metrics.resolvedNotional),
    winRate: toNumber(metrics.winRate),
    topGainConcentration: toNumber(metrics.topGainConcentration),
    last90dPnl: null,
    lastActiveDate: metrics.lastActiveDate ?? null,
  };
}

function buildOutcomeSummaries(signalWallets) {
  const byOutcome = new Map();
  for (const wallet of signalWallets) {
    const current = byOutcome.get(wallet.currentOutcome) ?? {
      outcome: wallet.currentOutcome,
      specialistCount: 0,
      totalCurrentSize: 0,
      weightedSmartSize: 0,
      weightedEntryNumerator: 0,
      weightedEntryWeight: 0,
      topSpecialists: [],
    };
    current.specialistCount += 1;
    current.totalCurrentSize += wallet.currentSize ?? 0;
    current.weightedSmartSize += (wallet.currentSize ?? 0) * (wallet.labelWeight ?? 0);
    if (typeof wallet.averageEntry === "number" && typeof wallet.currentSize === "number") {
      current.weightedEntryNumerator += wallet.averageEntry * wallet.currentSize;
      current.weightedEntryWeight += wallet.currentSize;
    }
    current.topSpecialists.push(wallet);
    byOutcome.set(wallet.currentOutcome, current);
  }

  return Array.from(byOutcome.values())
    .map((summary) => ({
      outcome: summary.outcome,
      specialistCount: summary.specialistCount,
      totalCurrentSize: round(summary.totalCurrentSize),
      weightedSmartSize: round(summary.weightedSmartSize),
      weightedAverageEntry:
        summary.weightedEntryWeight > 0 ? round(summary.weightedEntryNumerator / summary.weightedEntryWeight) : null,
      averageEntryStatus: summary.weightedEntryWeight > 0 ? "available" : "unavailable",
      topSpecialists: sortSignalWallets(summary.topSpecialists).slice(0, 8),
    }))
    .sort((a, b) => (b.weightedSmartSize ?? 0) - (a.weightedSmartSize ?? 0));
}

function buildSmartGap({ outcomes, currentPrices }) {
  const totalWeightedSmartSize = sum(outcomes.map((outcome) => outcome.weightedSmartSize ?? outcome.totalCurrentSize ?? 0));
  return outcomes
    .map((outcome) => {
      const weightedSmartSize = outcome.weightedSmartSize ?? outcome.totalCurrentSize ?? 0;
      const smartShare = totalWeightedSmartSize > 0 ? weightedSmartSize / totalWeightedSmartSize : 0;
      const marketPrice = priceForOutcome(currentPrices, outcome.outcome);
      return {
        outcome: outcome.outcome,
        smartShare: round(smartShare),
        marketPrice,
        gap: typeof marketPrice === "number" ? round(smartShare - marketPrice) : null,
        weightedSmartSize: round(weightedSmartSize),
        holderSize: outcome.totalCurrentSize,
        holderCount: outcome.specialistCount,
      };
    })
    .sort((a, b) => gapMagnitude(b.gap) - gapMagnitude(a.gap));
}

function buildDataQuality({ categories, relevantRecords, primary, secondary, outcomes, registryRefreshedAt, holderSnapshotAt, now }) {
  const states = [];
  const primaryEvidence = relevantRecords.some((record) => PRIMARY_LABELS.has(record.label));
  const registryAgeMs = ageMs(registryRefreshedAt, now);
  const holderAgeMs = ageMs(holderSnapshotAt, now);

  if (categories.length === 0) states.push("market_metadata_unavailable");
  if (typeof holderAgeMs === "number" && holderAgeMs > HOLDER_STALE_MS) states.push("stale_holder_snapshot");
  if (typeof registryAgeMs === "number" && registryAgeMs > REGISTRY_STALE_MS) states.push("stale_registry");
  if (primary.length === 0 && secondary.length > 0) states.push("small_sample_only");
  if (categories.length > 0 && !primaryEvidence && secondary.length === 0) states.push("insufficient_category_history");
  else if (primary.length === 0 && secondary.length === 0) states.push("no_specialists_currently_holding");
  if (primary.length > 0 && outcomes.some((outcome) => outcome.averageEntryStatus === "unavailable")) {
    states.push("average_entry_unavailable");
  }

  const priority = [
    "market_metadata_unavailable",
    "stale_holder_snapshot",
    "stale_registry",
    "small_sample_only",
    "insufficient_category_history",
    "no_specialists_currently_holding",
    "average_entry_unavailable",
  ];

  return {
    status: priority.find((state) => states.includes(state)) ?? "ready",
    states: states.length > 0 ? states : ["ready"],
    primaryWalletCount: primary.length,
    secondaryWalletCount: secondary.length,
    relevantRegistryRecords: relevantRecords.length,
    holderSnapshotAt,
    registryRefreshedAt,
  };
}

function buildIntelligenceHeadline({ outcomes, categories, dataQuality }) {
  if (dataQuality.status === "small_sample_only") return "Small-sample wallets only";
  if (dataQuality.status === "insufficient_category_history") {
    return `Insufficient ${categories[0] ?? "category"} specialist history`;
  }
  if (dataQuality.status === "no_specialists_currently_holding") return "No specialists currently holding";
  const dominant = outcomes[0];
  if (!dominant) return "Smart-money signal unavailable";
  const entry =
    dominant.weightedAverageEntry === null ? "avg entry unavailable" : `avg ${Math.round(dominant.weightedAverageEntry * 100)}c`;
  return `${dominant.specialistCount} ${categories[0] ?? "market"} specialists ${dominant.outcome} @ ${entry}`;
}

function sortSignalWallets(wallets) {
  return [...wallets].sort((a, b) => {
    const sizeDelta = (b.currentSize ?? 0) - (a.currentSize ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
    return (b.realizedPnl ?? 0) - (a.realizedPnl ?? 0);
  });
}

function tagText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return [item.label, item.name, item.slug, item.title].filter(Boolean).join(" ");
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function maxIsoDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function ageMs(value, now) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return now.getTime() - time;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function gapMagnitude(value) {
  return typeof value === "number" ? Math.abs(value) : -1;
}
