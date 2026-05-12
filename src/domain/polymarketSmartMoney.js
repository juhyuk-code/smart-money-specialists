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
  directional_sharp: 1,
  category_sharp: 1,
  high_roi_small_account: 0.25,
  proven_specialist: 1,
  emerging_specialist: 0.5,
  one_hit_wonder: 0,
  generalist: 0,
  observed_unclassified: 0,
  bond_buyer: 0,
  yield_grinder: 0,
  market_maker_or_arb: 0,
  high_pnl_whale: 0,
  mixed: 0,
  insufficient_sample: 0,
};

export const REGISTRY_THRESHOLDS = {
  smart: {
    minClosedMarkets: 30,
    minTotalStake: 5000,
    minDaysActive: 30,
    minDirectionalStakeShare: 0.3,
    minDirectionalClosedMarkets: 15,
    minCategoryClosedMarkets: 10,
    minCategoryDirectionalClosedMarkets: 5,
    minCategoryStake: 1000,
    maxHighProbStakeShare: 0.6,
    maxUltraHighProbStakeShare: 0.35,
    maxAverageEntry: 0.82,
    maxLowUpsideStakeShare: 0.6,
    maxLargestMarketPnlShare: 0.35,
  },
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

const PRIMARY_LABELS = new Set(["directional_sharp", "category_sharp"]);
const SECONDARY_LABELS = new Set([
  "bond_buyer",
  "yield_grinder",
  "market_maker_or_arb",
  "high_pnl_whale",
  "high_roi_small_account",
  "mixed",
  "insufficient_sample",
  "one_hit_wonder",
  "proven_specialist",
  "emerging_specialist",
]);
const HOLDER_STALE_MS = 5 * 60 * 1000;
const REGISTRY_STALE_MS = 36 * 60 * 60 * 1000;
const MIN_PRIMARY_LIVE_COST_BASIS = 100;

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

export function deriveLeaderboardLabels(sources = []) {
  const labels = new Map();
  const allTimePnlSources = sources.filter(
    (source) => source?.timePeriod === "ALL" && source?.orderBy === "PNL" && Number.isFinite(Number(source.rank)),
  );
  const bestOverallRank = Math.min(
    Infinity,
    ...allTimePnlSources
      .filter((source) => source.category === "OVERALL")
      .map((source) => Number(source.rank)),
  );

  if (bestOverallRank <= 100) addLeaderboardLabel(labels, "top_100_pnl", "Top 100 PnL", "global_pnl", bestOverallRank);
  if (bestOverallRank <= 250) addLeaderboardLabel(labels, "top_250_pnl", "Top 250 PnL", "global_pnl", bestOverallRank);
  if (bestOverallRank <= 1000) addLeaderboardLabel(labels, "top_1000_pnl", "Top 1000 PnL", "global_pnl", bestOverallRank);

  return Array.from(labels.values());
}

export function entryPriceBucket(entryPrice) {
  const price = toNumber(entryPrice);
  if (price === null) return "unknown";
  if (price >= 0.01 && price < 0.2) return "0.01-0.20";
  if (price >= 0.2 && price < 0.4) return "0.20-0.40";
  if (price >= 0.4 && price < 0.6) return "0.40-0.60";
  if (price >= 0.6 && price < 0.8) return "0.60-0.80";
  if (price >= 0.8 && price < 0.9) return "0.80-0.90";
  if (price >= 0.9 && price < 0.95) return "0.90-0.95";
  if (price >= 0.95 && price <= 1) return "0.95-0.99";
  return "unknown";
}

export function maxRoiForEntry(entryPrice) {
  const price = toNumber(entryPrice);
  if (!price || price <= 0) return null;
  return (1 - price) / price;
}

export function buildWalletSmartProfile({ wallet, closedPositions, marketMetadataByConditionId = new Map() }) {
  const normalizedWallet = normalizeWallet(wallet) ?? wallet;
  const positions = normalizeHistoricalPositions({ wallet: normalizedWallet, closedPositions, marketMetadataByConditionId });
  const walletMetrics = computeSmartMetrics(positions);
  const walletType = classifyWalletType(walletMetrics);
  const smartScoreRaw = computeSmartScoreRaw(walletMetrics);
  const smartScoreAdjusted = computeAdjustedSmartScore(walletMetrics, smartScoreRaw);
  const categoryProfiles = buildCategorySmartProfiles({
    wallet: normalizedWallet,
    positions,
    walletMetrics,
    walletType,
    smartScoreRaw,
    smartScoreAdjusted,
  });

  return {
    wallet: normalizedWallet,
    walletType,
    smartScoreRaw,
    smartScoreAdjusted,
    metrics: {
      ...walletMetrics,
      wallet,
      walletType,
      smartScoreRaw,
      smartScoreAdjusted,
    },
    categoryProfiles,
    positions,
  };
}

export function buildWalletCategoryPerformance({ wallet, closedPositions, marketMetadataByConditionId = new Map() }) {
  return buildWalletSmartProfile({ wallet, closedPositions, marketMetadataByConditionId }).categoryProfiles;
}

function normalizeHistoricalPositions({ wallet, closedPositions, marketMetadataByConditionId }) {
  const byKey = new Map();
  for (const position of closedPositions ?? []) {
    const conditionId = position.conditionId;
    if (!conditionId) continue;
    const market = marketMetadataByConditionId.get(conditionId);
    const categories = normalizeCategories({
      question: market?.question ?? position.title,
      title: position.title,
      slug: market?.marketSlug ?? market?.slug ?? position.slug,
      eventSlug: position.eventSlug,
      tags: market?.tags ?? market?.rawTags ?? position.tags ?? [],
    });
    const outcome = position.outcome ?? "";
    const key = `${wallet}:${conditionId}:${outcome}`;
    const stake = Math.max(0, toNumber(position.totalBought) ?? toNumber(position.resolvedNotional) ?? 0);
    const pnl = toNumber(position.realizedPnl) ?? 0;
    const entry = clampProbability(toNumber(position.averageEntry ?? position.avgPrice));
    const current = byKey.get(key) ?? {
      wallet,
      conditionId,
      outcome,
      asset: position.asset ?? null,
      title: position.title ?? market?.question ?? null,
      slug: position.slug ?? market?.slug ?? market?.marketSlug ?? null,
      categories,
      averageEntry: entry,
      totalStake: 0,
      realizedPnl: 0,
      timestamp: normalizeTimestampSeconds(position.timestamp),
      endDate: normalizeDate(position.endDate),
      raw: position.raw ?? position,
    };
    current.totalStake += stake;
    current.realizedPnl += pnl;
    current.timestamp = minTimestamp(current.timestamp, normalizeTimestampSeconds(position.timestamp));
    current.endDate = maxIsoDate(current.endDate, normalizeDate(position.endDate));
    if (entry !== null && current.averageEntry !== null && current.totalStake > 0) {
      current.averageEntry = ((current.averageEntry * Math.max(0, current.totalStake - stake)) + entry * stake) / current.totalStake;
    } else if (entry !== null) {
      current.averageEntry = entry;
    }
    byKey.set(key, current);
  }

  return Array.from(byKey.values()).map((position) => {
    const maxRoi = maxRoiForEntry(position.averageEntry);
    return {
      ...position,
      totalStake: round(position.totalStake),
      realizedPnl: round(position.realizedPnl),
      averageEntry: position.averageEntry === null ? null : round(position.averageEntry),
      entryBucket: entryPriceBucket(position.averageEntry),
      isDirectional: isDirectionalEntry(position.averageEntry),
      isHighProbability: typeof position.averageEntry === "number" && position.averageEntry >= 0.85,
      isUltraHighProbability: typeof position.averageEntry === "number" && position.averageEntry >= 0.95,
      isLowUpside: typeof maxRoi === "number" && maxRoi <= 0.1,
      maxRoi: maxRoi === null ? null : round(maxRoi),
      won: position.realizedPnl > 0,
      weightedEdge: weightedEdgeForPosition(position),
      activeAt: normalizeDate(position.timestamp ?? position.endDate),
    };
  });
}

function computeSmartMetrics(positions) {
  const closedMarkets = positions.length;
  const totalStake = sum(positions.map((position) => position.totalStake));
  const realizedPnl = sum(positions.map((position) => position.realizedPnl));
  const wins = positions.filter((position) => position.realizedPnl > 0).length;
  const positivePnls = positions.map((position) => position.realizedPnl).filter((pnl) => pnl > 0).sort((a, b) => b - a);
  const directional = positions.filter((position) => position.isDirectional);
  const highProbStake = sum(positions.filter((position) => position.isHighProbability).map((position) => position.totalStake));
  const ultraHighProbStake = sum(positions.filter((position) => position.isUltraHighProbability).map((position) => position.totalStake));
  const lowUpsideStake = sum(positions.filter((position) => position.isLowUpside).map((position) => position.totalStake));
  const directionalStake = sum(directional.map((position) => position.totalStake));
  const directionalPnl = sum(directional.map((position) => position.realizedPnl));
  const entryNumerator = sum(positions.map((position) => (position.averageEntry ?? 0) * (position.totalStake ?? 0)));
  const weightedEdgeNumerator = sum(positions.map((position) => (position.weightedEdge ?? 0) * (position.totalStake ?? 0)));
  const firstActive = minIsoDate(...positions.map((position) => position.activeAt).filter(Boolean));
  const lastActiveDate = maxIsoDateList(positions.map((position) => position.activeAt).filter(Boolean));
  const daysActive = firstActive && lastActiveDate
    ? Math.max(1, Math.ceil((new Date(lastActiveDate).getTime() - new Date(firstActive).getTime()) / 86_400_000) + 1)
    : 0;
  const categoryPnl = new Map();
  for (const position of positions) {
    for (const category of position.categories ?? ["other"]) {
      categoryPnl.set(category, (categoryPnl.get(category) ?? 0) + position.realizedPnl);
    }
  }
  const positiveCategoryPnl = Array.from(categoryPnl.values()).filter((value) => value > 0);
  const largestCategoryPnl = Math.max(0, ...positiveCategoryPnl);
  const totalPositiveCategoryPnl = sum(positiveCategoryPnl);
  const marketRois = positions
    .filter((position) => position.totalStake > 0)
    .map((position) => position.realizedPnl / position.totalStake);
  const avgMarketRoi = average(marketRois);
  const stdMarketRoi = standardDeviation(marketRois);
  const consistency = stdMarketRoi > 0 ? avgMarketRoi / stdMarketRoi : avgMarketRoi > 0 ? 1 : 0;
  const bondness = computeBondness({
    highProbStakeShare: share(highProbStake, totalStake),
    ultraHighProbStakeShare: share(ultraHighProbStake, totalStake),
    decidedStakeShare: 0,
    averageEntry: share(entryNumerator, totalStake),
  });

  return {
    realizedPnl: round(realizedPnl),
    totalStake: round(totalStake),
    resolvedNotional: round(totalStake),
    roi: totalStake > 0 ? round(realizedPnl / totalStake) : 0,
    shrunkRoi: round(realizedPnl / (totalStake + 1000)),
    wins,
    winRate: closedMarkets > 0 ? round(wins / closedMarkets) : 0,
    shrunkWinRate: round((wins + 5) / (closedMarkets + 10)),
    closedMarkets,
    resolvedMarketCount: closedMarkets,
    marketsTraded: closedMarkets,
    daysActive,
    averageEntry: totalStake > 0 ? round(entryNumerator / totalStake) : null,
    directionalClosedMarkets: directional.length,
    directionalStake: round(directionalStake),
    directionalStakeShare: share(directionalStake, totalStake),
    directionalPnl: round(directionalPnl),
    directionalRoi: directionalStake > 0 ? round(directionalPnl / directionalStake) : 0,
    highProbStakeShare: share(highProbStake, totalStake),
    ultraHighProbStakeShare: share(ultraHighProbStake, totalStake),
    lowUpsideStakeShare: share(lowUpsideStake, totalStake),
    decidedStakeShare: 0,
    bondness,
    largestMarketPnlShare: share(Math.max(0, ...positivePnls), sum(positivePnls)),
    top5MarketPnlShare: share(sum(positivePnls.slice(0, 5)), sum(positivePnls)),
    largestCategoryPnlShare: share(largestCategoryPnl, totalPositiveCategoryPnl),
    weightedEdge: totalStake > 0 ? round(weightedEdgeNumerator / totalStake) : 0,
    consistency: round(consistency),
    lastActiveDate,
    clv1h: null,
    clv6h: null,
    clv24h: null,
    clv72h: null,
    clv24hMidOdds: null,
  };
}

function buildCategorySmartProfiles({ wallet, positions, walletMetrics, walletType, smartScoreRaw, smartScoreAdjusted }) {
  const byCategory = new Map();
  for (const position of positions) {
    for (const category of position.categories ?? ["other"]) {
      const current = byCategory.get(category) ?? [];
      current.push(position);
      byCategory.set(category, current);
    }
  }

  return Array.from(byCategory.entries()).map(([category, categoryPositions]) => {
    const metrics = computeSmartMetrics(categoryPositions);
    const label = classifyCategorySmartProfile(metrics, walletMetrics, walletType);
    return {
      wallet,
      category,
      label,
      walletType,
      smartScoreRaw,
      smartScoreAdjusted,
      ...metrics,
      topGainConcentration: metrics.largestMarketPnlShare,
      metrics: {
        ...metrics,
        walletType,
        smartScoreRaw,
        smartScoreAdjusted,
      },
    };
  });
}

export function classifyWalletType(metrics, thresholds = REGISTRY_THRESHOLDS.smart) {
  if (metrics.closedMarkets < thresholds.minClosedMarkets || metrics.totalStake < thresholds.minTotalStake || metrics.daysActive < thresholds.minDaysActive) {
    return "insufficient_sample";
  }
  if (metrics.highProbStakeShare > 0.7) return "bond_buyer";
  if (metrics.highProbStakeShare > 0.45 && metrics.roi < 0.08) return "yield_grinder";
  if (metrics.totalStake >= 100000 && metrics.roi >= 0.01 && metrics.directionalStakeShare < 0.15) return "market_maker_or_arb";
  if (isDirectionalSharp(metrics, thresholds)) return "directional_sharp";
  if (metrics.realizedPnl >= 10000 && metrics.roi > 0) return "high_pnl_whale";
  if (metrics.closedMarkets >= 10 && metrics.totalStake < thresholds.minTotalStake && metrics.roi >= 0.25) return "high_roi_small_account";
  return "mixed";
}

export function classifyCategorySmartProfile(metrics, walletMetrics = metrics, walletType = null, thresholds = REGISTRY_THRESHOLDS.smart) {
  if (["bond_buyer", "yield_grinder", "market_maker_or_arb"].includes(walletType)) return walletType;
  if (walletType === "insufficient_sample") return "insufficient_sample";
  if (
    metrics.closedMarkets >= thresholds.minCategoryClosedMarkets &&
    metrics.totalStake >= thresholds.minCategoryStake &&
    metrics.directionalClosedMarkets >= thresholds.minCategoryDirectionalClosedMarkets &&
    metrics.directionalRoi > 0 &&
    metrics.directionalStakeShare >= thresholds.minDirectionalStakeShare &&
    metrics.largestMarketPnlShare < thresholds.maxLargestMarketPnlShare &&
    !isBondExcluded(walletMetrics, thresholds)
  ) {
    return "category_sharp";
  }
  return walletType === "directional_sharp" ? "mixed" : walletType ?? "mixed";
}

function isDirectionalSharp(metrics, thresholds) {
  return (
    metrics.directionalStakeShare >= thresholds.minDirectionalStakeShare &&
    metrics.directionalClosedMarkets >= thresholds.minDirectionalClosedMarkets &&
    metrics.directionalRoi > 0 &&
    metrics.largestMarketPnlShare < thresholds.maxLargestMarketPnlShare &&
    !isBondExcluded(metrics, thresholds)
  );
}

function isBondExcluded(metrics, thresholds) {
  return (
    metrics.highProbStakeShare > thresholds.maxHighProbStakeShare ||
    metrics.ultraHighProbStakeShare > thresholds.maxUltraHighProbStakeShare ||
    (metrics.averageEntry ?? 0) > thresholds.maxAverageEntry ||
    metrics.lowUpsideStakeShare > thresholds.maxLowUpsideStakeShare
  );
}

function computeBondness(metrics) {
  return round(
    0.4 * (metrics.highProbStakeShare ?? 0) +
      0.3 * (metrics.ultraHighProbStakeShare ?? 0) +
      0.2 * (metrics.decidedStakeShare ?? 0) +
      0.1 * Math.max(0, (metrics.averageEntry ?? 0) - 0.75),
  );
}

function computeSmartScoreRaw(metrics) {
  const pnlScore = clamp01(Math.log1p(Math.max(0, metrics.realizedPnl ?? 0)) / Math.log1p(100000));
  const roiScore = clamp01(((metrics.shrunkRoi ?? 0) + 0.1) / 0.5);
  const edgeScore = clamp01(((metrics.weightedEdge ?? 0) + 0.2) / 0.6);
  const directionalScore = clamp01(((metrics.directionalRoi ?? 0) + 0.05) / 0.4);
  const winScore = clamp01(metrics.shrunkWinRate ?? 0);
  const consistencyScore = clamp01(((metrics.consistency ?? 0) + 1) / 2);
  return round(
    0.2 * pnlScore +
      0.2 * roiScore +
      0.2 * edgeScore +
      0.2 * directionalScore +
      0.1 * winScore +
      0.1 * consistencyScore,
  );
}

function computeAdjustedSmartScore(metrics, rawScore) {
  const concentrationPenalty = clamp01(Math.max(0, (metrics.largestMarketPnlShare ?? 0) - 0.35) / 0.65);
  const activityFactor = metrics.daysActive >= REGISTRY_THRESHOLDS.smart.minDaysActive ? 1 : 0.5;
  return round(rawScore * (1 - (metrics.bondness ?? 0)) * (1 - concentrationPenalty) * activityFactor);
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
    if (isPrimarySignal(record, signalWallet)) primary.push(signalWallet);
    else if (SECONDARY_LABELS.has(record.label) || hasLeaderboardSignal(record)) secondary.push(signalWallet);
    else if (PRIMARY_LABELS.has(record.label)) secondary.push({ ...signalWallet, liveSignalQuality: "non_actionable_entry" });
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
    active: market.active ?? null,
    closed: market.closed ?? null,
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

export function buildExposureRankedMarkets({
  positions,
  leaderboardSourcesByWallet = new Map(),
  marketMetadataByConditionId = new Map(),
  fetchedAt,
  registryRefreshedAt,
  now = new Date(),
} = {}) {
  const byMarket = new Map();
  const snapshotAt = fetchedAt ?? now.toISOString();

  for (const position of positions ?? []) {
    const wallet = normalizeWallet(position.wallet ?? position.proxyWallet);
    const conditionId = position.conditionId;
    if (!wallet || !conditionId) continue;
    const leaderboardSources = leaderboardSourcesByWallet.get(wallet) ?? position.leaderboardSources ?? [];
    const leaderboardLabels = deriveLeaderboardLabels(leaderboardSources);
    if (leaderboardLabels.length === 0) continue;

    const marketMetadata = marketMetadataByConditionId.get(conditionId) ?? position.market ?? null;
    const market = mergeExposureMarketMetadata(conditionId, position, marketMetadata);
    const current = byMarket.get(conditionId) ?? {
      market,
      wallets: new Map(),
      positions: [],
    };
    current.market = mergeExposureMarketMetadata(conditionId, position, current.market);
    current.positions.push(position);
    current.wallets.set(wallet, {
      wallet,
      leaderboardSources,
      leaderboardLabels,
    });
    byMarket.set(conditionId, current);
  }

  const markets = [];
  for (const group of byMarket.values()) {
    const signalWallets = group.positions
      .map((position) => {
        const wallet = normalizeWallet(position.wallet ?? position.proxyWallet);
        const walletRecord = group.wallets.get(wallet);
        return walletRecord ? buildCohortSignalWallet({ position, walletRecord }) : null;
      })
      .filter(Boolean);
    if (signalWallets.length === 0) continue;

    const outcomes = buildOutcomeSummaries(signalWallets);
    const smartGap = buildSmartGap({ outcomes, currentPrices: group.market.currentPrices });
    const totalCurrentExposure = round(sum(signalWallets.map((wallet) => wallet.currentValue ?? wallet.costBasis ?? wallet.currentSize ?? 0)));
    const totalCostBasis = round(sum(signalWallets.map((wallet) => wallet.costBasis ?? 0)));
    const cohortWalletCount = new Set(signalWallets.map((wallet) => wallet.wallet)).size;
    const topCohortPresent = bestCohortLabel(signalWallets.flatMap((wallet) => wallet.leaderboardLabels ?? []))?.id ?? null;
    const topCohortRank = Math.min(
      ...signalWallets.flatMap((wallet) => wallet.leaderboardLabels ?? []).map((label) => label.rank ?? Infinity),
    );
    const exposureByOutcome = new Map();
    for (const wallet of signalWallets) {
      const exposure = wallet.currentValue ?? wallet.costBasis ?? wallet.currentSize ?? 0;
      exposureByOutcome.set(wallet.currentOutcome, (exposureByOutcome.get(wallet.currentOutcome) ?? 0) + exposure);
    }
    const maxOutcomeExposure = Math.max(0, ...exposureByOutcome.values());
    const outcomeConcentration = totalCurrentExposure > 0 ? round(maxOutcomeExposure / totalCurrentExposure) : 0;
    const labelBreakdown = {};
    for (const wallet of signalWallets) {
      const labelId = bestCohortLabel(wallet.leaderboardLabels)?.id ?? "top_pnl_wallet";
      labelBreakdown[labelId] = (labelBreakdown[labelId] ?? 0) + 1;
    }

    markets.push({
      conditionId: group.market.conditionId,
      marketSlug: group.market.marketSlug ?? group.market.slug ?? null,
      question: group.market.question,
      currentPrices: group.market.currentPrices ?? {},
      parentTags: group.market.parentTags ?? normalizeCategories(group.market),
      volume24h: group.market.volume24h ?? 0,
      active: group.market.active ?? true,
      closed: group.market.closed ?? false,
      outcomes,
      status: "ready",
      registryRefreshedAt: registryRefreshedAt ?? null,
      marketDataRefreshedAt: snapshotAt,
      holderSnapshotAt: snapshotAt,
      smartGap,
      labelBreakdown,
      primarySignalWallets: sortSignalWallets(signalWallets).slice(0, 12),
      secondarySignalWallets: [],
      dataQuality: {
        status: "ready",
        states: ["ready"],
        primaryWalletCount: cohortWalletCount,
        secondaryWalletCount: 0,
        relevantRegistryRecords: cohortWalletCount,
        holderSnapshotAt: snapshotAt,
        registryRefreshedAt: registryRefreshedAt ?? null,
      },
      exposureRank: {
        rank: null,
        score: exposureRankScore({ cohortWalletCount, topCohortPresent, currentExposure: totalCurrentExposure, outcomeConcentration }),
        cohortWalletCount,
        topCohortPresent,
        topCohortRank: Number.isFinite(topCohortRank) ? topCohortRank : null,
        currentExposure: totalCurrentExposure,
        costBasis: totalCostBasis,
        outcomeConcentration,
        freshness: snapshotAt,
      },
      headline: buildExposureHeadline({ cohortWalletCount, dominant: outcomes[0], topCohortPresent }),
    });
  }

  return markets
    .sort(compareExposureRankedMarkets)
    .map((market, index) => ({
      ...market,
      exposureRank: {
        ...market.exposureRank,
        rank: index + 1,
      },
    }));
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
    category_sharp: 8,
    directional_sharp: 7,
    proven_specialist: 5,
    emerging_specialist: 4,
    high_roi_small_account: 3,
    one_hit_wonder: 3,
    generalist: 2,
    mixed: 2,
    high_pnl_whale: 2,
    market_maker_or_arb: 1,
    yield_grinder: 1,
    bond_buyer: 1,
    observed_unclassified: 1,
    insufficient_sample: 0,
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
  const averageEntry = toNumber(position.averageEntry ?? position.avgPrice);
  const shares = toNumber(position.size) ?? 0;
  const currentPrice = toNumber(position.currentPrice ?? position.currPrice ?? position.curPrice);
  const costBasis = typeof averageEntry === "number" ? shares * averageEntry : null;
  const currentValue = toNumber(position.currentValue) ?? (typeof currentPrice === "number" ? shares * currentPrice : null);
  return {
    wallet,
    displayLabel: position.displayLabel ?? position.name ?? position.pseudonym ?? truncateWallet(wallet),
    knownHandle: position.knownHandle ?? null,
    category: record.category,
    label: record.label,
    walletType: record.walletType ?? metrics.walletType ?? record.label,
    smartScoreAdjusted: toNumber(record.smartScoreAdjusted ?? metrics.smartScoreAdjusted),
    smartScoreRaw: toNumber(record.smartScoreRaw ?? metrics.smartScoreRaw),
    bondness: toNumber(metrics.bondness),
    directionalRoi: toNumber(metrics.directionalRoi),
    directionalStakeShare: toNumber(metrics.directionalStakeShare),
    highProbStakeShare: toNumber(metrics.highProbStakeShare),
    ultraHighProbStakeShare: toNumber(metrics.ultraHighProbStakeShare),
    largestMarketPnlShare: toNumber(metrics.largestMarketPnlShare ?? metrics.topGainConcentration),
    shrunkWinRate: toNumber(metrics.shrunkWinRate),
    weightedEdge: toNumber(metrics.weightedEdge),
    clv24hMidOdds: toNumber(metrics.clv24hMidOdds),
    labelWeight: labelWeight(record.label),
    currentOutcome: position.outcome,
    currentSize: shares,
    shares,
    costBasis: costBasis === null ? null : round(costBasis),
    currentValue: currentValue === null ? null : round(currentValue),
    averageEntry,
    realizedPnl: toNumber(metrics.realizedPnl),
    roi: toNumber(metrics.roi),
    closedMarkets: toNumber(metrics.resolvedMarketCount ?? metrics.closedMarkets),
    resolvedNotional: toNumber(metrics.resolvedNotional ?? metrics.totalStake),
    winRate: toNumber(metrics.winRate),
    topGainConcentration: toNumber(metrics.topGainConcentration ?? metrics.largestMarketPnlShare),
    leaderboardLabels: record.leaderboardLabels ?? metrics.leaderboardLabels ?? [],
    last90dPnl: null,
    lastActiveDate: metrics.lastActiveDate ?? null,
  };
}

function buildCohortSignalWallet({ position, walletRecord }) {
  const wallet = normalizeWallet(position.wallet ?? position.proxyWallet) ?? position.wallet;
  const averageEntry = toNumber(position.averageEntry ?? position.avgPrice);
  const shares = toNumber(position.size) ?? 0;
  const currentPrice = toNumber(position.currentPrice ?? position.currPrice ?? position.curPrice);
  const costBasis = typeof averageEntry === "number" ? shares * averageEntry : toNumber(position.totalBought);
  const currentValue = toNumber(position.currentValue) ?? (typeof currentPrice === "number" ? shares * currentPrice : null);
  const bestLabel = bestCohortLabel(walletRecord.leaderboardLabels);
  const bestSource = [...(walletRecord.leaderboardSources ?? [])]
    .filter((source) => source.category === "OVERALL" && source.timePeriod === "ALL" && source.orderBy === "PNL")
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0];
  return {
    wallet,
    displayLabel: position.displayLabel ?? position.name ?? position.pseudonym ?? truncateWallet(wallet),
    knownHandle: position.knownHandle ?? null,
    category: position.category ?? "top_pnl",
    label: bestLabel?.id ?? "top_pnl_wallet",
    walletType: "top_pnl_wallet",
    smartScoreAdjusted: null,
    smartScoreRaw: null,
    bondness: null,
    directionalRoi: null,
    directionalStakeShare: null,
    highProbStakeShare: null,
    ultraHighProbStakeShare: null,
    largestMarketPnlShare: null,
    shrunkWinRate: null,
    weightedEdge: null,
    clv24hMidOdds: null,
    labelWeight: cohortLabelWeight(bestLabel?.id),
    currentOutcome: position.outcome,
    currentSize: shares,
    shares,
    costBasis: costBasis === null ? null : round(costBasis),
    currentValue: currentValue === null ? null : round(currentValue),
    averageEntry,
    realizedPnl: toNumber(bestSource?.pnl),
    roi: null,
    closedMarkets: null,
    resolvedNotional: toNumber(bestSource?.volume),
    winRate: null,
    topGainConcentration: null,
    leaderboardLabels: walletRecord.leaderboardLabels ?? [],
    last90dPnl: null,
    lastActiveDate: null,
  };
}

function mergeExposureMarketMetadata(conditionId, position, marketMetadata = null) {
  const question = marketMetadata?.question ?? position.question ?? position.title ?? conditionId;
  const slug = marketMetadata?.marketSlug ?? marketMetadata?.slug ?? position.marketSlug ?? position.slug ?? null;
  const currentPrices = {
    ...(marketMetadata?.currentPrices ?? {}),
    ...(position.currentPrices ?? {}),
  };
  const positionOutcome = position.outcome ? String(position.outcome).toUpperCase() : null;
  const positionPrice = toNumber(position.currentPrice ?? position.currPrice ?? position.curPrice);
  if (positionOutcome && typeof positionPrice === "number") currentPrices[positionOutcome] = positionPrice;
  return {
    conditionId,
    marketSlug: slug,
    slug,
    question,
    currentPrices,
    parentTags: marketMetadata?.parentTags?.length ? marketMetadata.parentTags : normalizeCategories({ question, slug, tags: marketMetadata?.tags ?? [] }),
    rawTags: marketMetadata?.rawTags ?? marketMetadata?.tags ?? [],
    tags: marketMetadata?.tags ?? [],
    volume24h: marketMetadata?.volume24h ?? position.volume24h ?? 0,
    active: marketMetadata?.active ?? position.active ?? true,
    closed: marketMetadata?.closed ?? position.closed ?? false,
    raw: marketMetadata?.raw ?? position.raw ?? position,
  };
}

function bestCohortLabel(labels = []) {
  return [...labels].sort((a, b) => cohortTier(a.id) - cohortTier(b.id) || (a.rank ?? Infinity) - (b.rank ?? Infinity))[0] ?? null;
}

function cohortTier(id) {
  if (id === "top_100_pnl") return 0;
  if (id === "top_250_pnl") return 1;
  if (id === "top_1000_pnl") return 2;
  return 3;
}

function cohortLabelWeight(id) {
  if (id === "top_100_pnl") return 3;
  if (id === "top_250_pnl") return 2;
  if (id === "top_1000_pnl") return 1;
  return 0;
}

function exposureRankScore({ cohortWalletCount, topCohortPresent, currentExposure, outcomeConcentration }) {
  return round((cohortWalletCount * 1_000_000) + (cohortLabelWeight(topCohortPresent) * 100_000) + currentExposure + (outcomeConcentration * 100));
}

function compareExposureRankedMarkets(a, b) {
  return (
    (b.exposureRank?.cohortWalletCount ?? 0) - (a.exposureRank?.cohortWalletCount ?? 0) ||
    cohortLabelWeight(b.exposureRank?.topCohortPresent) - cohortLabelWeight(a.exposureRank?.topCohortPresent) ||
    (b.exposureRank?.currentExposure ?? 0) - (a.exposureRank?.currentExposure ?? 0) ||
    (b.exposureRank?.outcomeConcentration ?? 0) - (a.exposureRank?.outcomeConcentration ?? 0) ||
    (a.exposureRank?.topCohortRank ?? Infinity) - (b.exposureRank?.topCohortRank ?? Infinity)
  );
}

function buildExposureHeadline({ cohortWalletCount, dominant, topCohortPresent }) {
  if (!dominant) return "Top-PnL wallet exposure unavailable";
  const tier = topCohortPresent === "top_100_pnl" ? "top-100" : topCohortPresent === "top_250_pnl" ? "top-250" : "top-1000";
  return `${cohortWalletCount} ${tier} PnL wallets exposed; leading ${dominant.outcome}`;
}

function hasLeaderboardSignal(record) {
  return (record.leaderboardLabels ?? record.metrics?.leaderboardLabels ?? []).length > 0;
}

function isPrimarySignal(record, wallet) {
  if (PRIMARY_LABELS.has(record.label) && isActionableLiveSignal(wallet)) return true;
  return hasGlobalPnlLabel(record) && (wallet.costBasis ?? wallet.currentValue ?? wallet.currentSize ?? 0) >= MIN_PRIMARY_LIVE_COST_BASIS;
}

function hasGlobalPnlLabel(record) {
  return (record.leaderboardLabels ?? record.metrics?.leaderboardLabels ?? []).some((label) =>
    ["top_100_pnl", "top_250_pnl", "top_1000_pnl"].includes(label.id),
  );
}

function buildOutcomeSummaries(signalWallets) {
  const byOutcome = new Map();
  for (const wallet of signalWallets) {
    const current = byOutcome.get(wallet.currentOutcome) ?? {
      outcome: wallet.currentOutcome,
      specialistCount: 0,
      totalCurrentSize: 0,
      totalCostBasis: 0,
      totalCurrentValue: 0,
      weightedSmartSize: 0,
      weightedEntryNumerator: 0,
      weightedEntryWeight: 0,
      topSpecialists: [],
    };
    current.specialistCount += 1;
    current.totalCurrentSize += wallet.currentSize ?? 0;
    current.totalCostBasis += wallet.costBasis ?? 0;
    current.totalCurrentValue += wallet.currentValue ?? 0;
    const signalNotional = wallet.costBasis ?? wallet.currentValue ?? wallet.currentSize ?? 0;
    current.weightedSmartSize += signalNotional;
    if (typeof wallet.averageEntry === "number" && signalNotional > 0) {
      current.weightedEntryNumerator += wallet.averageEntry * signalNotional;
      current.weightedEntryWeight += signalNotional;
    }
    current.topSpecialists.push(wallet);
    byOutcome.set(wallet.currentOutcome, current);
  }

  return Array.from(byOutcome.values())
    .map((summary) => ({
      outcome: summary.outcome,
      specialistCount: summary.specialistCount,
      totalCurrentSize: round(summary.totalCurrentSize),
      totalCostBasis: round(summary.totalCostBasis),
      totalCurrentValue: round(summary.totalCurrentValue),
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
    const sizeDelta = ((b.costBasis ?? b.currentValue ?? b.currentSize) ?? 0) - ((a.costBasis ?? a.currentValue ?? a.currentSize) ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
    const scoreDelta = (b.smartScoreAdjusted ?? 0) - (a.smartScoreAdjusted ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    return (b.realizedPnl ?? 0) - (a.realizedPnl ?? 0);
  });
}

function isActionableLiveSignal(wallet) {
  return (
    isDirectionalEntry(wallet.averageEntry) &&
    (wallet.costBasis ?? 0) >= MIN_PRIMARY_LIVE_COST_BASIS
  );
}

function tagText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return [item.label, item.name, item.slug, item.title].filter(Boolean).join(" ");
}

function addLeaderboardLabel(labels, id, displayLabel, type, rank, category = null) {
  const current = labels.get(id);
  if (current && current.rank <= rank) return;
  labels.set(id, {
    id,
    label: displayLabel,
    type,
    rank,
    category,
  });
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

function normalizeTimestampSeconds(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue > 10_000_000_000 ? numberValue / 1000 : numberValue);
}

function maxIsoDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function maxIsoDateList(values) {
  return values.reduce((latest, value) => maxIsoDate(latest, value), null);
}

function minIsoDate(...values) {
  return values.filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

function minTimestamp(left, right) {
  if (left === null || left === undefined) return right ?? null;
  if (right === null || right === undefined) return left ?? null;
  return Math.min(left, right);
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

function clampProbability(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isDirectionalEntry(entry) {
  return typeof entry === "number" && entry >= 0.2 && entry <= 0.8;
}

function weightedEdgeForPosition(position) {
  if (typeof position.averageEntry !== "number") return 0;
  const finalOutcome = position.realizedPnl > 0 ? 1 : 0;
  return finalOutcome - position.averageEntry;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function share(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : 0;
}

function average(values) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function gapMagnitude(value) {
  return typeof value === "number" ? Math.abs(value) : -1;
}
