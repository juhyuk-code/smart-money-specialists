import {
  buildMarketIntelligence,
  buildWalletCategoryPerformance,
  classifyWalletLabel,
} from "../domain/polymarketSmartMoney.js";
import { isBtcUpDownMarket } from "../domain/signal.js";

const DEFAULT_MARKET_LIMIT = 40;
const LIVE_REFRESH_MS = 2 * 60 * 1000;
const DEFAULT_REGISTRY_WALLET_LIMIT = Number(process.env.POLYMARKET_REGISTRY_WALLET_LIMIT ?? 1000);

export class PolymarketIntelligenceService {
  constructor(api, store) {
    this.api = api;
    this.store = store;
    this.memoryCache = null;
  }

  async scanDefaultMarkets({ refresh = false } = {}) {
    if (!refresh) {
      const cached = await this.readFreshSnapshot();
      if (cached) return cached;
    }
    return this.refreshLiveMarkets();
  }

  async refreshLiveMarkets() {
    const [{ markets }, registry] = await Promise.all([
      this.api.listTrendingMarkets({ limit: DEFAULT_MARKET_LIMIT }),
      this.ensureReady(),
    ]);
    const filteredMarkets = markets.filter((market) => !isBtcUpDownMarket(market)).slice(0, DEFAULT_MARKET_LIMIT);
    await this.store?.upsertMarkets?.(filteredMarkets);

    const categories = [...new Set(filteredMarkets.flatMap((market) => market.parentTags ?? []))];
    const categoryPerformance = await this.store?.readCategoryPerformanceByCategories?.(categories) ?? [];
    const results = [];

    for (const market of filteredMarkets) {
      try {
        const { positions, fetchedAt } = await this.api.listMarketPositions(market.conditionId);
        await this.store?.upsertWalletCandidates?.(positions.map((position) => position.wallet), "top_live_market_holder");
        await this.store?.saveHolderSnapshot?.({
          conditionId: market.conditionId,
          positions,
          fetchedAt,
        });
        results.push(
          buildMarketIntelligence({
            market,
            positions,
            categoryPerformance,
            registryRefreshedAt: registry.refreshedAt,
            holderSnapshotAt: fetchedAt,
          }),
        );
      } catch (error) {
        results.push(buildHolderFetchFailedMarket(market, registry.refreshedAt, error));
      }
    }

    const payload = {
      registryRefreshedAt: registry.refreshedAt,
      markets: results.sort((a, b) => smartGapMagnitude(b) - smartGapMagnitude(a) || (b.volume24h ?? 0) - (a.volume24h ?? 0)),
    };
    await this.store?.saveMarketIntelligence?.(payload.markets);
    this.memoryCache = {
      value: payload,
      cachedAt: new Date().toISOString(),
    };
    return payload;
  }

  async scanConditionId(conditionId) {
    const stored = await this.store?.readMarketIntelligence?.(conditionId);
    if (stored) return stored;
    const { markets } = await this.api.listTrendingMarkets({ limit: DEFAULT_MARKET_LIMIT });
    const market = markets.find((candidate) => candidate.conditionId === conditionId);
    if (!market) return null;
    const registry = await this.ensureReady();
    const categoryPerformance = await this.store?.readCategoryPerformanceByCategories?.(market.parentTags ?? []) ?? [];
    const { positions, fetchedAt } = await this.api.listMarketPositions(market.conditionId);
    return buildMarketIntelligence({
      market,
      positions,
      categoryPerformance,
      registryRefreshedAt: registry.refreshedAt,
      holderSnapshotAt: fetchedAt,
    });
  }

  async customScan(url) {
    if (!/^https?:\/\/(www\.)?polymarket\.com\//i.test(url)) {
      return { status: "market_metadata_unavailable", error: "Paste a Polymarket market URL.", markets: [] };
    }
    const resolved = await this.api.resolvePolymarketUrl(url);
    if (resolved.error || resolved.markets.length === 0) {
      return { status: "market_metadata_unavailable", error: "We could not resolve this market yet.", markets: [] };
    }

    const registry = await this.ensureReady();
    const categories = [...new Set(resolved.markets.flatMap((market) => market.parentTags ?? []))];
    const categoryPerformance = await this.store?.readCategoryPerformanceByCategories?.(categories) ?? [];
    const markets = [];
    for (const market of resolved.markets) {
      const { positions, fetchedAt } = await this.api.listMarketPositions(market.conditionId);
      markets.push(
        buildMarketIntelligence({
          market,
          positions,
          categoryPerformance,
          registryRefreshedAt: registry.refreshedAt,
          holderSnapshotAt: fetchedAt,
        }),
      );
    }
    await this.store?.saveMarketIntelligence?.(markets);
    return { status: "ready", error: null, markets };
  }

  async rebuild({ walletLimit = DEFAULT_REGISTRY_WALLET_LIMIT } = {}) {
    if (!this.store?.isAvailable?.()) {
      return {
        records: [],
        refreshedAt: null,
        audit: {
          status: "database_unavailable",
          message: "Set DATABASE_URL before rebuilding the Polymarket smart wallet registry.",
        },
      };
    }

    const startedAt = new Date().toISOString();
    let candidates = await this.store.readCandidateWallets({ limit: walletLimit });
    if (candidates.length === 0) {
      await this.refreshLiveMarkets();
      candidates = await this.store.readCandidateWallets({ limit: walletLimit });
    }

    const records = [];
    const walletLabels = {};
    const errors = [];
    for (const wallet of candidates) {
      try {
        const { positions } = await this.api.listClosedPositionsForWallet(wallet);
        await this.store.upsertClosedPositions(wallet, positions);
        const marketIds = [...new Set(positions.map((position) => position.conditionId).filter(Boolean))];
        const marketMetadataByConditionId = await this.store.readMarketMetadataByConditionIds(marketIds);
        const walletRecords = buildWalletCategoryPerformance({
          wallet,
          closedPositions: positions,
          marketMetadataByConditionId,
        });
        const walletLabel = classifyWalletLabel(walletRecords);
        walletLabels[wallet] = walletLabel;
        if (walletRecords.length > 0) await this.store.upsertCategoryPerformance(walletRecords);
        await this.store.upsertWalletLabel(wallet, walletLabel, walletRecords);
        records.push(...walletRecords);
      } catch (error) {
        if (errors.length < 12) {
          errors.push({ wallet, message: error?.message ?? String(error) });
        }
      }
    }

    const refreshedAt = new Date().toISOString();
    const audit = buildRegistryAudit({
      candidates,
      records,
      walletLabels,
      errors,
      apiDiagnostics: this.api.getDiagnostics?.() ?? null,
      startedAt,
      refreshedAt,
    });
    await this.store.saveRegistryRun({
      startedAt,
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      audit,
    });
    return { records, refreshedAt, audit };
  }

  async ensureReady() {
    if (this.store?.isAvailable?.()) {
      const [run, records] = await Promise.all([
        this.store.readRegistryAudit(),
        this.store.readAllCategoryPerformance(),
      ]);
      return {
        records,
        refreshedAt: run?.finished_at?.toISOString?.() ?? run?.finished_at ?? null,
        audit: run?.audit ?? {
          status: records.length > 0 ? "records_available" : "not_built",
          registryRecords: records.length,
        },
      };
    }
    return {
      records: [],
      refreshedAt: null,
      audit: {
        status: "database_unavailable",
        registryRecords: 0,
      },
    };
  }

  async readRawPayloadAudit(args) {
    return this.store?.readRawPayloadAudit?.(args) ?? [];
  }

  async readFreshSnapshot() {
    const stored = await this.store?.readLatestMarketIntelligence?.({ limit: DEFAULT_MARKET_LIMIT });
    if (stored?.markets?.length && !isStale(stored.cachedAt, LIVE_REFRESH_MS)) {
      return {
        registryRefreshedAt: stored.registryRefreshedAt,
        markets: stored.markets,
      };
    }
    if (this.memoryCache && !isStale(this.memoryCache.cachedAt, LIVE_REFRESH_MS)) return this.memoryCache.value;
    return null;
  }
}

function buildHolderFetchFailedMarket(market, registryRefreshedAt, error) {
  const now = new Date().toISOString();
  return {
    conditionId: market.conditionId,
    marketSlug: market.marketSlug ?? market.slug ?? null,
    question: market.question,
    currentPrices: market.currentPrices ?? {},
    parentTags: market.parentTags ?? [],
    volume24h: market.volume24h ?? null,
    outcomes: [],
    status: "holder_fetch_failed",
    registryRefreshedAt,
    marketDataRefreshedAt: now,
    holderSnapshotAt: now,
    smartGap: [],
    labelBreakdown: {},
    primarySignalWallets: [],
    secondarySignalWallets: [],
    dataQuality: {
      status: "holder_fetch_failed",
      states: ["holder_fetch_failed"],
      reason: error?.message ?? String(error),
      primaryWalletCount: 0,
      secondaryWalletCount: 0,
      relevantRegistryRecords: 0,
      holderSnapshotAt: now,
      registryRefreshedAt,
    },
    headline: "Holder data unavailable",
  };
}

function buildRegistryAudit({ candidates, records, walletLabels, errors, apiDiagnostics, startedAt, refreshedAt }) {
  const labelsByCategory = {};
  const recordsByCategory = {};
  for (const record of records) {
    recordsByCategory[record.category] = (recordsByCategory[record.category] ?? 0) + 1;
    labelsByCategory[record.category] ??= {};
    labelsByCategory[record.category][record.label] = (labelsByCategory[record.category][record.label] ?? 0) + 1;
  }

  const walletLabelCounts = {};
  for (const label of Object.values(walletLabels)) {
    walletLabelCounts[label] = (walletLabelCounts[label] ?? 0) + 1;
  }

  return {
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    startedAt,
    refreshedAt,
    candidateWallets: candidates.length,
    walletsProcessed: Object.keys(walletLabels).length,
    registryRecords: records.length,
    recordsByCategory,
    labelsByCategory,
    walletLabelCounts,
    sampleRecords: records
      .filter((record) => record.label !== "observed_unclassified")
      .sort((a, b) => (b.realizedPnl ?? 0) - (a.realizedPnl ?? 0))
      .slice(0, 12),
    errors,
    apiDiagnostics,
  };
}

function smartGapMagnitude(market) {
  const gap = market.smartGap?.[0]?.gap;
  return typeof gap === "number" ? Math.abs(gap) : -1;
}

function isStale(value, ttlMs) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) || Date.now() - time > ttlMs;
}
