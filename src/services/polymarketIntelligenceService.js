import {
  buildExposureRankedMarkets,
  buildMarketIntelligence,
  buildWalletCategoryPerformance,
  buildWalletSmartProfile,
  classifyWalletLabel,
  deriveLeaderboardLabels,
} from "../domain/polymarketSmartMoney.js";
import { isBtcUpDownMarket } from "../domain/signal.js";

const DEFAULT_MARKET_LIMIT = 40;
const LIVE_REFRESH_MS = 2 * 60 * 1000;
const DEFAULT_REGISTRY_WALLET_LIMIT = Number(process.env.POLYMARKET_REGISTRY_WALLET_LIMIT ?? 1000);
const DEFAULT_COHORT_EXPOSURE_LIMIT = Number(process.env.POLYMARKET_COHORT_EXPOSURE_LIMIT ?? 1000);
const DEFAULT_COHORT_MARKET_LIMIT = Number(process.env.POLYMARKET_COHORT_MARKET_LIMIT ?? 100);

export class PolymarketIntelligenceService {
  constructor(api, store) {
    this.api = api;
    this.store = store;
    this.memoryCache = null;
  }

  async scanDefaultMarkets({ refresh = false, mode = process.env.POLYMARKET_DEFAULT_MARKETS_MODE } = {}) {
    if (!refresh) {
      const stored = await this.readStoredSnapshot();
      if (stored) return stored;
    }
    if (mode === "live" || mode === "legacy_live") return this.refreshLiveMarkets();
    return this.refreshCohortExposureMarkets();
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
      markets: results
        .filter(isOpenMarket)
        .sort((a, b) => smartTraderCount(b) - smartTraderCount(a) || smartMoneyVolume(b) - smartMoneyVolume(a) || (b.volume24h ?? 0) - (a.volume24h ?? 0)),
    };
    await this.store?.saveMarketIntelligence?.(payload.markets);
    await this.store?.pruneMarketIntelligenceExcept?.(payload.markets.map((market) => market.conditionId));
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

  async refreshCohortExposureMarkets({
    cohortLimit = DEFAULT_COHORT_EXPOSURE_LIMIT,
    marketLimit = DEFAULT_COHORT_MARKET_LIMIT,
    positionPageLimit = Number(process.env.POLYMARKET_COHORT_POSITION_MAX_PAGES ?? 10),
    sizeThreshold = Number(process.env.POLYMARKET_CURRENT_POSITION_SIZE_THRESHOLD ?? 0),
    persistStoreWrites = true,
  } = {}) {
    const startedAt = new Date().toISOString();
    const discovered = await this.api.listAllTimePnlLeaderboardCohort({ maxRows: cohortLimit, limit: 50 });
    const cohortWallets = (discovered.wallets ?? []).slice(0, cohortLimit);
    const wallets = cohortWallets.map((row) => row.wallet).filter(Boolean);
    await this.store?.upsertWalletLeaderboardSources?.(cohortWallets);
    await this.store?.upsertWalletCandidates?.(wallets, "all_time_pnl_cohort");

    const leaderboardSourcesByWallet = new Map(cohortWallets.map((row) => [row.wallet, row.sources ?? []]));
    const positions = [];
    const errors = [];
    const fetchedAtByWallet = new Map();
    for (const wallet of wallets) {
      try {
        const result = await this.api.listCurrentPositionsForWallet(wallet, {
          maxPages: positionPageLimit,
          sizeThreshold,
        });
        fetchedAtByWallet.set(wallet, result.fetchedAt);
        positions.push(...(result.positions ?? []));
        await this.store?.saveCohortCurrentPositions?.({
          wallet,
          positions: result.positions ?? [],
          fetchedAt: result.fetchedAt,
          cohortSource: "all_time_pnl_top_1000",
        });
      } catch (error) {
        if (errors.length < 20) errors.push({ wallet, message: error?.message ?? String(error) });
      }
    }

    const marketIds = [...new Set(positions.map((position) => position.conditionId).filter(Boolean))];
    const marketMetadataByConditionId = await this.store?.readMarketMetadataByConditionIds?.(marketIds) ?? new Map();
    const marketsForMetadata = positions.map((position) => ({
      conditionId: position.conditionId,
      marketSlug: position.marketSlug ?? position.slug,
      slug: position.marketSlug ?? position.slug,
      question: position.question ?? position.title ?? position.conditionId,
      currentPrices: position.currentPrices ?? {},
      parentTags: [],
      rawTags: [],
      tags: [],
      volume24h: position.volume24h ?? 0,
      active: position.active ?? true,
      closed: position.closed ?? false,
      raw: position.raw ?? position,
    }));
    await this.store?.upsertMarkets?.(marketsForMetadata.filter((market) => market.conditionId));

    const refreshedAt = new Date().toISOString();
    const marketDataRefreshedAt = maxIsoDateList([...fetchedAtByWallet.values()]) ?? discovered.fetchedAt ?? refreshedAt;
    const markets = buildExposureRankedMarkets({
      positions,
      leaderboardSourcesByWallet,
      marketMetadataByConditionId,
      fetchedAt: marketDataRefreshedAt,
      registryRefreshedAt: discovered.fetchedAt ?? refreshedAt,
      now: new Date(refreshedAt),
    })
      .filter(isOpenMarket)
      .slice(0, marketLimit);

    const payload = {
      mode: "cohort_exposure",
      registryRefreshedAt: discovered.fetchedAt ?? refreshedAt,
      marketDataRefreshedAt,
      cohort: {
        source: "all_time_pnl",
        requestedWallets: cohortLimit,
        walletsDiscovered: wallets.length,
        walletsProcessed: fetchedAtByWallet.size,
        positionsIngested: positions.length,
      },
      errors,
      apiDiagnostics: this.api.getDiagnostics?.() ?? null,
      markets,
    };
    await this.store?.saveMarketIntelligence?.(payload.markets);
    await this.store?.pruneMarketIntelligenceExcept?.(payload.markets.map((market) => market.conditionId));
    this.memoryCache = {
      value: payload,
      cachedAt: refreshedAt,
    };
    return payload;
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
    try {
      const discovered = typeof this.api.listAllTimePnlLeaderboardCohort === "function"
        ? await this.api.listAllTimePnlLeaderboardCohort({ limit: 50, maxRows: walletLimit })
        : await this.api.discoverLeaderboardWallets?.({ limit: 50 });
      const leaderboardWallets = discovered?.wallets?.map((row) => row.wallet).filter(Boolean) ?? [];
      await this.store.upsertWalletLeaderboardSources?.(discovered?.wallets ?? []);
      await this.store.upsertWalletCandidates(leaderboardWallets, "all_time_pnl_cohort");
      candidates = [...new Set([...leaderboardWallets, ...candidates])].slice(0, walletLimit);
    } catch (error) {
      // Leaderboard discovery broadens the sample, but existing live-holder candidates are enough to rebuild.
    }

    const leaderboardSourcesByWallet = await this.store.readLeaderboardSourcesByWallets?.(candidates) ?? new Map();
    const cachedClosedPositionCounts = await this.store.readClosedPositionCountsByWallets?.(candidates) ?? new Map();
    const fetchMissingClosedPositions = process.env.POLYMARKET_FETCH_MISSING_CLOSED_POSITIONS !== "false";
    const records = [];
    const walletLabels = {};
    const walletTypes = {};
    const leaderboardLabelCounts = {};
    const errors = [];
    for (const wallet of candidates) {
      try {
        const leaderboardSources = leaderboardSourcesByWallet.get(wallet) ?? [];
        const leaderboardLabels = deriveLeaderboardLabels(leaderboardSources);
        for (const label of leaderboardLabels) leaderboardLabelCounts[label.id] = (leaderboardLabelCounts[label.id] ?? 0) + 1;
        const cachedCount = cachedClosedPositionCounts.get(wallet) ?? 0;
        const positions = cachedCount > 0
          ? await this.store.readClosedPositionsForWallet(wallet)
          : fetchMissingClosedPositions
            ? (await this.api.listClosedPositionsForWallet(wallet, {
                maxPages: closedPositionPageLimit(leaderboardLabels),
              })).positions
            : [];
        if (cachedCount === 0) await this.store.upsertClosedPositions(wallet, positions);
        const marketIds = [...new Set(positions.map((position) => position.conditionId).filter(Boolean))];
        const marketMetadataByConditionId = await this.store.readMarketMetadataByConditionIds(marketIds);
        const smartProfile = buildWalletSmartProfile({
          wallet,
          closedPositions: positions,
          marketMetadataByConditionId,
        });
        smartProfile.metrics.leaderboardLabels = leaderboardLabels;
        const walletRecords = smartProfile.categoryProfiles.map((record) => ({
          ...record,
          leaderboardLabels,
          metrics: {
            ...record.metrics,
            leaderboardLabels,
          },
        }));
        smartProfile.categoryProfiles = walletRecords;
        const walletLabel = smartProfile.walletType ?? classifyWalletLabel(walletRecords);
        walletLabels[wallet] = walletLabel;
        walletTypes[wallet] = smartProfile.walletType;
        await this.store.upsertWalletMarketPositions(smartProfile.positions);
        await this.store.upsertWalletSmartProfile(smartProfile);
        await this.store.upsertCategorySmartProfiles(smartProfile.categoryProfiles);
        if (walletRecords.length > 0) await this.store.upsertCategoryPerformance(walletRecords);
        await this.store.upsertWalletLabel(wallet, walletLabel, { leaderboardLabels, categoryLabels: walletRecords });
        records.push(...smartProfile.categoryProfiles);
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
      walletTypes,
      leaderboardLabelCounts,
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

  async readStoredSnapshot() {
    const stored = await this.store?.readLatestMarketIntelligence?.({ limit: DEFAULT_MARKET_LIMIT });
    if (stored?.markets?.length) {
      return {
        registryRefreshedAt: stored.registryRefreshedAt,
        markets: stored.markets,
      };
    }
    return this.readFreshSnapshot();
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
    active: market.active ?? null,
    closed: market.closed ?? null,
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

function buildRegistryAudit({ candidates, records, walletLabels, walletTypes = {}, leaderboardLabelCounts = {}, errors, apiDiagnostics, startedAt, refreshedAt }) {
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
  const walletTypeCounts = {};
  for (const label of Object.values(walletTypes)) {
    walletTypeCounts[label] = (walletTypeCounts[label] ?? 0) + 1;
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
    walletTypeCounts,
    leaderboardLabelCounts,
    excludedBondLikeWallets: (walletTypeCounts.bond_buyer ?? 0) + (walletTypeCounts.yield_grinder ?? 0),
    directionalSharpWallets: walletTypeCounts.directional_sharp ?? 0,
    sampleRecords: records
      .filter((record) => record.label !== "insufficient_sample")
      .sort((a, b) => (b.smartScoreAdjusted ?? 0) - (a.smartScoreAdjusted ?? 0))
      .slice(0, 12),
    errors,
    apiDiagnostics,
  };
}

function closedPositionPageLimit(leaderboardLabels) {
  const ids = new Set((leaderboardLabels ?? []).map((label) => label.id));
  if (ids.has("top_100_pnl")) return Number(process.env.POLYMARKET_TOP_100_CLOSED_POSITION_MAX_PAGES ?? 100);
  if (ids.has("top_250_pnl")) return Number(process.env.POLYMARKET_TOP_250_CLOSED_POSITION_MAX_PAGES ?? 60);
  if (ids.has("top_1000_pnl")) return Number(process.env.POLYMARKET_TOP_1000_CLOSED_POSITION_MAX_PAGES ?? 30);
  return Number(process.env.POLYMARKET_CLOSED_POSITION_MAX_PAGES ?? 20);
}

function smartGapMagnitude(market) {
  const gap = market.smartGap?.[0]?.gap;
  return typeof gap === "number" ? Math.abs(gap) : -1;
}

function isOpenMarket(market) {
  return market.closed !== true && market.active !== false;
}

function smartMoneyVolume(market) {
  const gapVolume = (market.smartGap ?? []).reduce((sum, row) => sum + (row.weightedSmartSize ?? 0), 0);
  if (gapVolume > 0) return gapVolume;
  const primaryVolume = (market.primarySignalWallets ?? []).reduce((sum, wallet) => sum + walletNotional(wallet), 0);
  const secondaryVolume = (market.secondarySignalWallets ?? []).reduce((sum, wallet) => sum + walletNotional(wallet), 0);
  return primaryVolume + secondaryVolume;
}

function smartTraderCount(market) {
  const wallets = new Set();
  for (const wallet of market.primarySignalWallets ?? []) {
    if (wallet.wallet) wallets.add(wallet.wallet.toLowerCase());
  }
  if (wallets.size > 0) return wallets.size;
  for (const outcome of market.outcomes ?? []) {
    for (const wallet of outcome.topSpecialists ?? []) {
      if (wallet.wallet) wallets.add(wallet.wallet.toLowerCase());
    }
  }
  return wallets.size;
}

function maxIsoDateList(values) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function walletNotional(wallet) {
  return wallet.costBasis ?? wallet.currentValue ?? wallet.currentSize ?? 0;
}

function isStale(value, ttlMs) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) || Date.now() - time > ttlMs;
}
