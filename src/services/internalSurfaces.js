import { getDataSource } from "../appContext.js";
import { readMarketSnapshot } from "./snapshotStore.js";

export async function readDefaultMarketSnapshot() {
  const snapshot = await readMarketSnapshot(`default:${getDataSource()}`);
  if (!snapshot?.value?.markets || !Array.isArray(snapshot.value.markets)) {
    return {
      snapshotAvailable: false,
      refreshedAt: null,
      markets: [],
      cachedAt: null,
    };
  }

  return {
    snapshotAvailable: true,
    refreshedAt: snapshot.value.registryRefreshedAt ?? snapshot.cachedAt,
    markets: snapshot.value.markets,
    cachedAt: snapshot.cachedAt,
  };
}

export function buildLeaders(markets) {
  const wallets = collectWallets(markets);
  return Array.from(wallets.values())
    .sort((a, b) => ((b.realizedPnl ?? 0) - (a.realizedPnl ?? 0)) || (b.totalCurrentSize - a.totalCurrentSize))
    .map((wallet, index) => ({
      rank: index + 1,
      ...wallet,
      realizedPnl: wallet.performanceSamples > 0 ? wallet.realizedPnl : null,
      last90dPnl: wallet.performanceSamples > 0 ? wallet.last90dPnl : null,
      closedMarkets: wallet.performanceSamples > 0 ? wallet.closedMarkets : null,
      roi: wallet.roiSamples > 0 ? wallet.roiTotal / wallet.roiSamples : null,
      leaderboardLabels: Array.from(wallet.leaderboardLabels.values()).sort(compareLeaderboardLabels),
      categories: Array.from(wallet.categories).sort(),
      markets: Array.from(wallet.markets.values()),
      outcomes: Array.from(wallet.outcomes).sort(),
    }));
}

export function buildWalletIndex(markets) {
  return buildLeaders(markets).map((leader) => ({
    rank: leader.rank,
    wallet: leader.wallet,
    displayLabel: leader.displayLabel,
    knownHandle: leader.knownHandle,
    categories: leader.categories,
    activeMarkets: leader.activeMarkets,
    totalCurrentSize: leader.totalCurrentSize,
    realizedPnl: leader.realizedPnl,
    last90dPnl: leader.last90dPnl,
    roi: leader.roi,
  }));
}

export function buildWalletDetail(markets, walletId) {
  const normalized = normalizeWalletId(walletId);
  const leader = buildLeaders(markets).find((item) => {
    return item.wallet.toLowerCase() === normalized || item.displayLabel.toLowerCase() === normalized;
  });
  if (!leader) return null;

  return {
    ...leader,
    positions: leader.markets,
  };
}

export async function buildEnrichedWalletDetail(markets, walletId, { api = null, store = null, now = new Date() } = {}) {
  const normalized = normalizeWalletId(walletId);
  const snapshotDetail = buildWalletDetail(markets, normalized);
  const [currentResult, closedResult, leaderboardSources] = await Promise.all([
    typeof api?.listCurrentPositionsForWallet === "function" ? api.listCurrentPositionsForWallet(normalized) : null,
    typeof api?.listClosedPositionsForWallet === "function" ? api.listClosedPositionsForWallet(normalized) : null,
    typeof store?.readLeaderboardSourcesByWallets === "function"
      ? store.readLeaderboardSourcesByWallets([normalized])
      : new Map(),
  ]);

  const directPositions = Array.isArray(currentResult?.positions)
    ? currentResult.positions.map(normalizeCurrentWalletPosition)
    : [];
  const closedPositions = (Array.isArray(closedResult?.positions) ? closedResult.positions : [])
    .map(normalizeClosedWalletPosition)
    .sort((a, b) => (b.realizedPnl ?? -Infinity) - (a.realizedPnl ?? -Infinity));
  const sources = leaderboardSources?.get?.(normalized) ?? leaderboardSources?.get?.(walletId) ?? [];
  const labels = mergeWalletLabels(snapshotDetail?.leaderboardLabels, sources);
  const positions = directPositions.length > 0 ? directPositions : snapshotDetail?.positions ?? [];

  if (!snapshotDetail && positions.length === 0 && closedPositions.length === 0 && labels.length === 0) return null;

  const pnlSummary = buildPnlSummary(closedPositions, now);
  return {
    ...(snapshotDetail ?? createDirectWalletDetail(normalized)),
    wallet: snapshotDetail?.wallet ?? normalized,
    positions,
    activeMarkets: positions.length,
    totalCurrentSize: positions.reduce((sum, position) => sum + (position.costBasis ?? position.currentValue ?? position.currentSize ?? position.size ?? 0), 0),
    closedPositions,
    pnlSummary,
    pnlSeries: buildPnlSeries(closedPositions),
    labels,
    polymarketProfileUrl: `https://polymarket.com/profile/${normalized}`,
  };
}

export function buildMarketDetail(markets, marketId) {
  const normalized = decodeURIComponent(marketId).toLowerCase();
  return markets.find((market) => {
    return market.conditionId?.toLowerCase() === normalized || market.marketSlug?.toLowerCase() === normalized;
  }) ?? null;
}

export function buildFeed(markets) {
  return markets
    .flatMap((market) =>
      market.outcomes.flatMap((outcome) =>
        outcome.topSpecialists.map((specialist) => ({
          id: `${market.conditionId}:${specialist.wallet}:${specialist.currentOutcome}`,
          time: market.marketDataRefreshedAt ?? market.registryRefreshedAt ?? null,
          wallet: specialist.wallet,
          displayLabel: specialist.displayLabel,
          knownHandle: specialist.knownHandle ?? null,
          action: "position",
          outcome: specialist.currentOutcome,
          size: specialist.currentSize,
          averageEntry: specialist.averageEntry,
          realizedPnl: specialist.realizedPnl,
          roi: specialist.roi,
          market: {
            conditionId: market.conditionId,
            marketSlug: market.marketSlug,
            question: market.question,
            currentPrices: market.currentPrices,
            parentTags: market.parentTags,
            volume24h: market.volume24h,
          },
          outcomeSpecialistCount: outcome.specialistCount,
        })),
      ),
    )
    .sort((a, b) => {
      const bTime = b.time ? new Date(b.time).getTime() : 0;
      const aTime = a.time ? new Date(a.time).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.size - a.size;
    });
}

function normalizeWalletId(walletId) {
  return decodeURIComponent(String(walletId ?? "")).toLowerCase();
}

function createDirectWalletDetail(wallet) {
  return {
    rank: null,
    wallet,
    displayLabel: shortWalletLabel(wallet),
    knownHandle: null,
    categories: [],
    activeMarkets: 0,
    totalCurrentSize: 0,
    realizedPnl: null,
    last90dPnl: null,
    closedMarkets: null,
    roi: null,
    leaderboardLabels: [],
    markets: [],
    outcomes: [],
  };
}

function normalizeCurrentWalletPosition(position) {
  return {
    conditionId: position.conditionId,
    marketSlug: position.marketSlug ?? position.slug ?? null,
    question: position.question ?? position.title ?? null,
    outcome: position.outcome ?? null,
    currentSize: position.currentSize ?? position.size ?? 0,
    shares: position.shares ?? position.size ?? position.currentSize ?? 0,
    costBasis: position.costBasis ?? position.totalBought ?? null,
    currentValue: position.currentValue ?? null,
    averageEntry: position.averageEntry ?? null,
    currentPrice: position.currentPrice ?? null,
    realizedPnl: position.realizedPnl ?? null,
    totalPnl: position.totalPnl ?? null,
    roi: position.roi ?? null,
    leaderboardLabels: position.leaderboardLabels ?? [],
    volume24h: position.volume24h ?? 0,
    parentTags: position.parentTags ?? [],
    currentPrices: position.currentPrices ?? {},
  };
}

function normalizeClosedWalletPosition(position) {
  return {
    wallet: position.wallet ?? null,
    conditionId: position.conditionId,
    marketSlug: position.marketSlug ?? position.slug ?? null,
    slug: position.slug ?? position.marketSlug ?? null,
    question: position.question ?? position.title ?? null,
    title: position.title ?? position.question ?? null,
    outcome: position.outcome ?? null,
    averageEntry: position.averageEntry ?? position.avgPrice ?? null,
    totalBought: position.totalBought ?? null,
    realizedPnl: position.realizedPnl ?? null,
    timestamp: position.timestamp ?? null,
    closedAt: timestampToIso(position.timestamp),
  };
}

function buildPnlSummary(closedPositions, now) {
  return {
    last30d: summarizePnlSince(closedPositions, now, 30),
    last90d: summarizePnlSince(closedPositions, now, 90),
    lifetime: summarizePnl(closedPositions),
  };
}

function summarizePnlSince(closedPositions, now, days) {
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  return summarizePnl(closedPositions.filter((position) => timestampMs(position.timestamp) >= cutoffMs));
}

function summarizePnl(positions) {
  return {
    realizedPnl: positions.reduce((sum, position) => sum + (position.realizedPnl ?? 0), 0),
    totalBought: positions.reduce((sum, position) => sum + (position.totalBought ?? 0), 0),
    markets: positions.length,
  };
}

function buildPnlSeries(closedPositions) {
  let cumulativePnl = 0;
  return [...closedPositions]
    .sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp))
    .map((position) => {
      cumulativePnl += position.realizedPnl ?? 0;
      return {
        conditionId: position.conditionId,
        timestamp: position.timestamp,
        date: timestampToIso(position.timestamp),
        realizedPnl: position.realizedPnl ?? 0,
        cumulativePnl,
      };
    });
}

function mergeWalletLabels(snapshotLabels = [], sources = []) {
  const labels = new Map();
  for (const label of snapshotLabels ?? []) labels.set(label.id, label);
  for (const source of sources ?? []) {
    const label = leaderboardSourceToLabel(source);
    if (!label) continue;
    const existing = labels.get(label.id);
    if (!existing || (label.rank ?? Infinity) < (existing.rank ?? Infinity)) labels.set(label.id, label);
  }
  return Array.from(labels.values()).sort(compareLeaderboardLabels);
}

function leaderboardSourceToLabel(source) {
  if (source?.category !== "OVERALL" || source?.timePeriod !== "ALL" || source?.orderBy !== "PNL") return null;
  if (typeof source.rank !== "number") return null;
  if (source.rank <= 100) return { id: "top_100_pnl", label: "Top 100 PnL", type: "leaderboard", rank: source.rank, category: source.category };
  if (source.rank <= 250) return { id: "top_250_pnl", label: "Top 250 PnL", type: "leaderboard", rank: source.rank, category: source.category };
  if (source.rank <= 1000) return { id: "top_1000_pnl", label: "Top 1000 PnL", type: "leaderboard", rank: source.rank, category: source.category };
  return null;
}

function timestampMs(value) {
  if (value === null || value === undefined || value === "") return 0;
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) return numberValue > 10_000_000_000 ? numberValue : numberValue * 1000;
  const dateMs = new Date(value).getTime();
  return Number.isNaN(dateMs) ? 0 : dateMs;
}

function timestampToIso(value) {
  const ms = timestampMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
}

function shortWalletLabel(wallet) {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

function collectWallets(markets) {
  const wallets = new Map();

  for (const market of markets) {
    for (const outcome of market.outcomes ?? []) {
      for (const specialist of outcome.topSpecialists ?? []) {
        const current = wallets.get(specialist.wallet) ?? createWalletRecord(specialist);
        current.displayLabel = specialist.displayLabel || current.displayLabel;
        current.knownHandle = specialist.knownHandle ?? current.knownHandle;
        current.categories.add(specialist.category ?? market.parentTags?.[0] ?? "market");
        current.outcomes.add(specialist.currentOutcome);
        current.activeMarkets += 1;
        current.totalCurrentSize += specialist.costBasis ?? specialist.currentValue ?? specialist.currentSize ?? 0;
        if (typeof specialist.realizedPnl === "number") {
          current.realizedPnl += specialist.realizedPnl;
          current.performanceSamples += 1;
        }
        if (typeof specialist.last90dPnl === "number") current.last90dPnl += specialist.last90dPnl;
        if (typeof specialist.closedMarkets === "number") current.closedMarkets += specialist.closedMarkets;
        if (typeof specialist.roi === "number") {
          current.roiTotal += specialist.roi;
          current.roiSamples += 1;
        }
        for (const label of specialist.leaderboardLabels ?? []) {
          const existing = current.leaderboardLabels.get(label.id);
          if (!existing || (label.rank ?? Infinity) < (existing.rank ?? Infinity)) {
            current.leaderboardLabels.set(label.id, label);
          }
        }
        current.markets.set(market.conditionId, {
          conditionId: market.conditionId,
          marketSlug: market.marketSlug,
          question: market.question,
          outcome: specialist.currentOutcome,
          currentSize: specialist.currentSize,
          shares: specialist.shares ?? specialist.currentSize,
          costBasis: specialist.costBasis ?? null,
          currentValue: specialist.currentValue ?? null,
          averageEntry: specialist.averageEntry,
          realizedPnl: specialist.realizedPnl,
          roi: specialist.roi,
          leaderboardLabels: specialist.leaderboardLabels ?? [],
          volume24h: market.volume24h,
          parentTags: market.parentTags,
          currentPrices: market.currentPrices,
        });
        wallets.set(specialist.wallet, current);
      }
    }
  }

  return wallets;
}

function createWalletRecord(specialist) {
  return {
    wallet: specialist.wallet,
    displayLabel: specialist.displayLabel,
    knownHandle: specialist.knownHandle ?? null,
    categories: new Set(),
    outcomes: new Set(),
    activeMarkets: 0,
    totalCurrentSize: 0,
    realizedPnl: 0,
    last90dPnl: 0,
    closedMarkets: 0,
    performanceSamples: 0,
    roiTotal: 0,
    roiSamples: 0,
    leaderboardLabels: new Map(),
    markets: new Map(),
  };
}

function compareLeaderboardLabels(a, b) {
  const tierDelta = leaderboardTier(a) - leaderboardTier(b);
  if (tierDelta !== 0) return tierDelta;
  return (a.rank ?? Infinity) - (b.rank ?? Infinity);
}

function leaderboardTier(label) {
  if (label.id === "top_100_pnl") return 0;
  if (label.id === "top_250_pnl") return 1;
  if (label.id === "top_1000_pnl") return 2;
  return 3;
}
