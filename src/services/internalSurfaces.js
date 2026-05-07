import { readMarketSnapshot } from "./snapshotStore.js";

const DEFAULT_SNAPSHOT_KEY = "default:preference";

export async function readDefaultMarketSnapshot() {
  const snapshot = await readMarketSnapshot(DEFAULT_SNAPSHOT_KEY);
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
  const normalized = decodeURIComponent(walletId).toLowerCase();
  const leader = buildLeaders(markets).find((item) => {
    return item.wallet.toLowerCase() === normalized || item.displayLabel.toLowerCase() === normalized;
  });
  if (!leader) return null;

  return {
    ...leader,
    positions: leader.markets,
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
        current.totalCurrentSize += specialist.currentSize ?? 0;
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
        current.markets.set(market.conditionId, {
          conditionId: market.conditionId,
          marketSlug: market.marketSlug,
          question: market.question,
          outcome: specialist.currentOutcome,
          currentSize: specialist.currentSize,
          averageEntry: specialist.averageEntry,
          realizedPnl: specialist.realizedPnl,
          roi: specialist.roi,
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
    markets: new Map(),
  };
}
