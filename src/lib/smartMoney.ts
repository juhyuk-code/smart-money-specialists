export type LeaderboardLabel = {
  id: string;
  label: string;
  type?: string;
  rank?: number | null;
  category?: string | null;
};

export type CohortFilter = "top_100_pnl" | "top_250_pnl" | "top_1000_pnl";

export const COHORT_FILTERS: Array<{ id: CohortFilter; label: string; helper: string }> = [
  { id: "top_1000_pnl", label: "Top 1000", helper: "default" },
  { id: "top_250_pnl", label: "Top 250", helper: "filter" },
  { id: "top_100_pnl", label: "Top 100", helper: "filter" },
];

export type Specialist = {
  wallet: string;
  displayLabel: string;
  knownHandle?: string;
  category?: string;
  label?: string;
  walletType?: string;
  smartScoreRaw?: number | null;
  smartScoreAdjusted?: number | null;
  bondness?: number | null;
  directionalRoi?: number | null;
  directionalStakeShare?: number | null;
  highProbStakeShare?: number | null;
  ultraHighProbStakeShare?: number | null;
  largestMarketPnlShare?: number | null;
  shrunkWinRate?: number | null;
  weightedEdge?: number | null;
  clv24hMidOdds?: number | null;
  labelWeight?: number;
  currentOutcome: string;
  currentSize: number;
  shares?: number;
  costBasis?: number | null;
  currentValue?: number | null;
  averageEntry: number | null;
  realizedPnl: number | null;
  roi: number | null;
  closedMarkets: number | null;
  resolvedNotional?: number | null;
  winRate?: number | null;
  topGainConcentration?: number | null;
  leaderboardLabels?: LeaderboardLabel[];
  last90dPnl: number | null;
};

export type MarketOutcome = {
  outcome: string;
  specialistCount: number;
  totalCurrentSize: number;
  totalCostBasis?: number;
  totalCurrentValue?: number;
  weightedSmartSize?: number;
  weightedAverageEntry: number | null;
  averageEntryStatus?: string;
  topSpecialists: Specialist[];
};

export type ExposureRank = {
  rank: number | null;
  score?: number;
  cohortWalletCount: number;
  topCohortPresent: CohortFilter | string | null;
  topCohortRank?: number | null;
  currentExposure: number;
  costBasis?: number;
  outcomeConcentration: number;
  freshness?: string | null;
};

export type SmartGapRow = {
  outcome: string;
  smartShare: number;
  marketPrice: number | null;
  gap: number | null;
  weightedSmartSize?: number;
  holderSize: number;
  holderCount: number;
};

export type DataQuality = {
  status: string;
  states: string[];
  primaryWalletCount?: number;
  secondaryWalletCount?: number;
  relevantRegistryRecords?: number;
  holderSnapshotAt?: string | null;
  registryRefreshedAt?: string | null;
};

export type SmartMoneyMarket = {
  conditionId: string;
  marketSlug: string;
  question: string;
  currentPrices: Record<string, number>;
  parentTags: string[];
  volume24h: number;
  active?: boolean | null;
  closed?: boolean | null;
  outcomes: MarketOutcome[];
  status: string;
  registryRefreshedAt: string | null;
  marketDataRefreshedAt: string | null;
  holderSnapshotAt?: string | null;
  headline: string;
  smartGap?: SmartGapRow[];
  labelBreakdown?: Record<string, number>;
  primarySignalWallets?: Specialist[];
  secondarySignalWallets?: Specialist[];
  dataQuality?: DataQuality;
  exposureRank?: ExposureRank;
};

export type MarketsPayload = {
  dataSource?: string;
  registryRefreshedAt: string | null;
  markets: SmartMoneyMarket[];
  mode?: string;
  marketDataRefreshedAt?: string | null;
  cohort?: {
    source?: string;
    requestedWallets?: number;
    walletsDiscovered?: number;
    walletsProcessed?: number;
    positionsIngested?: number;
  };
};

export type Snapshot = MarketsPayload & {
  savedAt: string;
};

export type Leader = {
  rank: number;
  wallet: string;
  displayLabel: string;
  knownHandle: string | null;
  categories: string[];
  activeMarkets: number;
  totalCurrentSize: number;
  realizedPnl: number | null;
  last90dPnl: number | null;
  closedMarkets: number | null;
  roi: number | null;
  leaderboardLabels?: LeaderboardLabel[];
  markets: Array<{
    conditionId: string;
    marketSlug: string;
    question: string;
    outcome: string;
    currentSize: number;
    shares?: number;
    costBasis?: number | null;
    currentValue?: number | null;
    averageEntry: number | null;
    realizedPnl: number | null;
    roi: number | null;
    leaderboardLabels?: LeaderboardLabel[];
    volume24h: number;
    parentTags: string[];
    currentPrices: Record<string, number>;
  }>;
  outcomes: string[];
};

export type WalletRow = Omit<Leader, "markets" | "outcomes" | "closedMarkets">;
export type PnlSummaryWindow = {
  realizedPnl: number;
  totalBought: number;
  markets: number;
};
export type WalletClosedPosition = {
  wallet?: string | null;
  conditionId: string;
  marketSlug?: string | null;
  slug?: string | null;
  question?: string | null;
  title?: string | null;
  outcome?: string | null;
  averageEntry?: number | null;
  totalBought?: number | null;
  realizedPnl?: number | null;
  timestamp?: number | string | null;
  closedAt?: string | null;
};
export type WalletPnlPoint = {
  conditionId: string;
  timestamp?: number | string | null;
  date: string | null;
  realizedPnl: number;
  cumulativePnl: number;
};
export type WalletDetail = Omit<Leader, "rank"> & {
  rank: number | null;
  positions: Leader["markets"];
  pnlSummary?: {
    last30d: PnlSummaryWindow;
    last90d: PnlSummaryWindow;
    lifetime: PnlSummaryWindow;
  };
  pnlSeries?: WalletPnlPoint[];
  closedPositions?: WalletClosedPosition[];
  labels?: LeaderboardLabel[];
  polymarketProfileUrl?: string;
};

export type FeedEvent = {
  id: string;
  time: string | null;
  wallet: string;
  displayLabel: string;
  knownHandle: string | null;
  action: string;
  outcome: string;
  size: number;
  averageEntry: number | null;
  realizedPnl: number | null;
  roi: number | null;
  market: {
    conditionId: string;
    marketSlug: string;
    question: string;
    currentPrices: Record<string, number>;
    parentTags: string[];
    volume24h: number;
  };
  outcomeSpecialistCount: number;
};

export const SNAPSHOT_KEY = "pref:last-market-snapshot:v3";
const PREVIOUS_SNAPSHOT_KEY = "pref:last-market-snapshot:v2";
const LEGACY_SNAPSHOT_KEY = "smart-money-specialists:last-market-snapshot";
const LEADERS_SNAPSHOT_KEY = "pref:last-leaders-snapshot";
const FEED_SNAPSHOT_KEY = "pref:last-feed-snapshot";
const WALLETS_SNAPSHOT_KEY = "pref:last-wallets-snapshot";
const WALLET_DETAIL_SNAPSHOT_PREFIX = "pref:last-wallet-detail:";

export function saveSnapshot(payload: MarketsPayload) {
  if (typeof window === "undefined" || payload.markets.length === 0) return;
  window.localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({
      ...payload,
      savedAt: new Date().toISOString(),
    }),
  );
}

export function readSnapshot(): Snapshot | null {
  if (typeof window === "undefined") return null;
  for (const key of [SNAPSHOT_KEY, PREVIOUS_SNAPSHOT_KEY, LEGACY_SNAPSHOT_KEY]) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (isUsefulMarketSnapshot(parsed)) return parsed;
    } catch {
      // Ignore corrupt snapshots and continue to the next known key.
    }
  }
  return null;
}

function isUsefulMarketSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object" || !("markets" in value)) return false;
  const markets = (value as { markets?: unknown }).markets;
  return Array.isArray(markets) && markets.some((market) => {
    const exposureRank = (market as SmartMoneyMarket).exposureRank;
    return Boolean(
      exposureRank &&
      ((exposureRank.cohortWalletCount ?? 0) > 0 ||
        (exposureRank.currentExposure ?? 0) > 0 ||
        typeof exposureRank.rank === "number"),
    );
  });
}

function saveClientSnapshot<T>(key: string, value: T, isUseful: (value: T) => boolean) {
  if (typeof window === "undefined" || !isUseful(value)) return;
  window.localStorage.setItem(
    key,
    JSON.stringify({
      value,
      savedAt: new Date().toISOString(),
    }),
  );
}

function readClientSnapshot<T>(key: string, isUseful: (value: unknown) => value is T): T | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return isUseful(parsed?.value) ? parsed.value : null;
  } catch {
    return null;
  }
}

function isLeaderArray(value: unknown): value is Leader[] {
  return Array.isArray(value) && value.length > 0;
}

function isFeedArray(value: unknown): value is FeedEvent[] {
  return Array.isArray(value) && value.length > 0;
}

function isWalletArray(value: unknown): value is WalletRow[] {
  return Array.isArray(value) && value.length > 0;
}

function isWalletDetail(value: unknown): value is WalletDetail {
  return Boolean(value && typeof value === "object" && "wallet" in value);
}

export type SmartMoneyFetchErrorCode = "timeout" | "http" | "network" | "invalid_json";

export class SmartMoneyFetchError extends Error {
  code: SmartMoneyFetchErrorCode;
  status?: number;
  cause?: unknown;

  constructor(message: string, code: SmartMoneyFetchErrorCode, options: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "SmartMoneyFetchError";
    this.code = code;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export type SmartMoneyFetchOptions = {
  timeoutMs?: number;
};

const DEFAULT_FETCH_TIMEOUT_MS = 8000;

type BoundedFetchOptions = RequestInit & SmartMoneyFetchOptions;

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError");
}

async function boundedFetchJson<T>(url: string, init: BoundedFetchOptions = {}): Promise<{ response: Response; data: T }> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: upstreamSignal, ...fetchInit } = init;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let didTimeout = false;

  const abortForTimeout = () => {
    didTimeout = true;
    controller.abort();
  };

  if (timeoutMs > 0) timeoutId = setTimeout(abortForTimeout, timeoutMs);

  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });

  try {
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });
    let data: T;
    try {
      data = await response.json();
    } catch (error) {
      throw new SmartMoneyFetchError("Smart money response was not valid JSON.", "invalid_json", {
        status: response.status,
        cause: error,
      });
    }
    if (!response.ok) {
      throw new SmartMoneyFetchError(`Smart money request failed with status ${response.status}.`, "http", {
        status: response.status,
      });
    }
    return { response, data };
  } catch (error) {
    if (error instanceof SmartMoneyFetchError) throw error;
    if (didTimeout || isAbortError(error)) {
      throw new SmartMoneyFetchError("Smart money request timed out.", "timeout", { cause: error });
    }
    throw new SmartMoneyFetchError("Smart money request failed.", "network", { cause: error });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

type MarketsApiResponse = MarketsPayload & { markets?: SmartMoneyMarket[] };

export async function fetchMarkets(options: SmartMoneyFetchOptions = {}): Promise<MarketsPayload | null> {
  const { data } = await boundedFetchJson<MarketsApiResponse>("/api/smart-money/markets", {
    headers: { accept: "application/json" },
    cache: "no-store",
    timeoutMs: options.timeoutMs,
  });
  if (!Array.isArray(data.markets) || data.markets.length === 0) return null;
  return {
    dataSource: data.dataSource,
    registryRefreshedAt: data.registryRefreshedAt,
    markets: data.markets,
    mode: data.mode,
    marketDataRefreshedAt: data.marketDataRefreshedAt,
    cohort: data.cohort,
  };
}

export async function scanCustomMarket(url: string, options: SmartMoneyFetchOptions = {}): Promise<MarketsPayload | null> {
  const { data } = await boundedFetchJson<MarketsApiResponse>("/api/smart-money/custom-scan", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url }),
    timeoutMs: options.timeoutMs,
  });
  if (!Array.isArray(data.markets) || data.markets.length === 0) return null;
  return {
    dataSource: data.dataSource,
    registryRefreshedAt: data.registryRefreshedAt ?? data.markets[0]?.registryRefreshedAt ?? null,
    marketDataRefreshedAt: data.marketDataRefreshedAt,
    mode: data.mode,
    cohort: data.cohort,
    markets: data.markets,
  };
}

export async function fetchLeaders(options: SmartMoneyFetchOptions = {}): Promise<Leader[]> {
  try {
    const { data } = await boundedFetchJson<{ leaders?: Leader[] }>("/api/smart-money/leaders", {
      headers: { accept: "application/json" },
      timeoutMs: options.timeoutMs,
    });
    const leaders = Array.isArray(data.leaders) ? data.leaders : [];
    saveClientSnapshot(LEADERS_SNAPSHOT_KEY, leaders, isLeaderArray);
    return leaders.length > 0 ? leaders : readClientSnapshot(LEADERS_SNAPSHOT_KEY, isLeaderArray) ?? [];
  } catch {
    return readClientSnapshot(LEADERS_SNAPSHOT_KEY, isLeaderArray) ?? [];
  }
}

export async function fetchFeed(options: SmartMoneyFetchOptions = {}): Promise<FeedEvent[]> {
  try {
    const { data } = await boundedFetchJson<{ feed?: FeedEvent[] }>("/api/smart-money/feed", {
      headers: { accept: "application/json" },
      timeoutMs: options.timeoutMs,
    });
    const feed = Array.isArray(data.feed) ? data.feed : [];
    saveClientSnapshot(FEED_SNAPSHOT_KEY, feed, isFeedArray);
    return feed.length > 0 ? feed : readClientSnapshot(FEED_SNAPSHOT_KEY, isFeedArray) ?? [];
  } catch {
    return readClientSnapshot(FEED_SNAPSHOT_KEY, isFeedArray) ?? [];
  }
}

export async function fetchWallets(options: SmartMoneyFetchOptions = {}): Promise<WalletRow[]> {
  try {
    const { data } = await boundedFetchJson<{ wallets?: WalletRow[] }>("/api/smart-money/wallets", {
      headers: { accept: "application/json" },
      timeoutMs: options.timeoutMs,
    });
    const wallets = Array.isArray(data.wallets) ? data.wallets : [];
    saveClientSnapshot(WALLETS_SNAPSHOT_KEY, wallets, isWalletArray);
    return wallets.length > 0 ? wallets : readClientSnapshot(WALLETS_SNAPSHOT_KEY, isWalletArray) ?? [];
  } catch {
    return readClientSnapshot(WALLETS_SNAPSHOT_KEY, isWalletArray) ?? [];
  }
}

export async function fetchWalletDetail(wallet: string, options: SmartMoneyFetchOptions = {}): Promise<WalletDetail | null> {
  const cacheKey = `${WALLET_DETAIL_SNAPSHOT_PREFIX}${wallet.toLowerCase()}`;
  try {
    const { data } = await boundedFetchJson<{ wallet?: WalletDetail }>(`/api/smart-money/wallets/${encodeURIComponent(wallet)}`, {
      headers: { accept: "application/json" },
      timeoutMs: options.timeoutMs,
    });
    if (data.wallet) saveClientSnapshot(cacheKey, data.wallet, isWalletDetail);
    return data.wallet ?? readClientSnapshot(cacheKey, isWalletDetail);
  } catch {
    return readClientSnapshot(cacheKey, isWalletDetail);
  }
}

export async function fetchMarketDetail(marketId: string, options: SmartMoneyFetchOptions = {}): Promise<SmartMoneyMarket | null> {
  const { data } = await boundedFetchJson<{ market?: SmartMoneyMarket }>(`/api/smart-money/markets/${encodeURIComponent(marketId)}`, {
    headers: { accept: "application/json" },
    timeoutMs: options.timeoutMs,
  });
  return data.market ?? null;
}

export function specialistCount(market: SmartMoneyMarket) {
  return market.outcomes.reduce((sum, outcome) => sum + outcome.specialistCount, 0);
}

export function hasTopPnlExposure(market: SmartMoneyMarket) {
  return marketExposureWalletCount(market) > 0 || marketExposureValue(market) > 0;
}

export function cohortLabel(cohort: CohortFilter) {
  if (cohort === "top_100_pnl") return "top 100";
  if (cohort === "top_250_pnl") return "top 250";
  return "top 1000";
}

export function isOpenMarket(market: Pick<SmartMoneyMarket, "active" | "closed">) {
  return market.closed !== true && market.active !== false;
}

export function marketSmartMoneyVolume(market: SmartMoneyMarket) {
  const gapVolume = (market.smartGap ?? []).reduce((sum, row) => sum + (row.weightedSmartSize ?? 0), 0);
  if (gapVolume > 0) return gapVolume;

  const outcomeVolume = market.outcomes.reduce(
    (sum, outcome) => sum + (outcome.totalCostBasis ?? outcome.totalCurrentValue ?? outcome.totalCurrentSize ?? 0),
    0,
  );
  if (outcomeVolume > 0) return outcomeVolume;

  const walletByKey = new Map<string, Specialist>();
  for (const wallet of [...(market.primarySignalWallets ?? []), ...(market.secondarySignalWallets ?? [])]) {
    walletByKey.set(`${wallet.wallet}:${wallet.currentOutcome}`, wallet);
  }
  return Array.from(walletByKey.values()).reduce(
    (sum, wallet) => sum + (wallet.costBasis ?? wallet.currentValue ?? wallet.currentSize ?? 0),
    0,
  );
}

export function marketSmartTraderCount(market: SmartMoneyMarket) {
  return countSignalWallets(market);
}


export function marketMatchesCohort(market: SmartMoneyMarket, cohort: CohortFilter) {
  if (!hasCohortExposure(market)) return false;
  const threshold = cohortThreshold(cohort);
  const ranks = marketCohortRanks(market);
  if (ranks.length === 0) return cohort === "top_1000_pnl" && marketExposureWalletCount(market) > 0;
  return ranks.some((rank) => rank <= threshold);
}

export function compareExposureRankedMarkets(a: SmartMoneyMarket, b: SmartMoneyMarket) {
  return (
    compareNullableAsc(a.exposureRank?.rank, b.exposureRank?.rank) ||
    (b.exposureRank?.score ?? 0) - (a.exposureRank?.score ?? 0) ||
    marketExposureWalletCount(b) - marketExposureWalletCount(a) ||
    cohortStrength(b.exposureRank?.topCohortPresent) - cohortStrength(a.exposureRank?.topCohortPresent) ||
    marketExposureValue(b) - marketExposureValue(a) ||
    (b.exposureRank?.outcomeConcentration ?? 0) - (a.exposureRank?.outcomeConcentration ?? 0) ||
    compareNullableAsc(a.exposureRank?.topCohortRank, b.exposureRank?.topCohortRank) ||
    a.question.localeCompare(b.question)
  );
}

export function marketExposureWalletCount(market: SmartMoneyMarket) {
  return market.exposureRank?.cohortWalletCount ?? countSignalWallets(market);
}

export function marketExposureValue(market: SmartMoneyMarket) {
  return market.exposureRank?.currentExposure ?? marketSmartMoneyVolume(market);
}

function hasCohortExposure(market: SmartMoneyMarket) {
  return marketExposureWalletCount(market) > 0 || marketCohortRanks(market).length > 0;
}

function countSignalWallets(market: SmartMoneyMarket) {
  const wallets = new Set<string>();
  for (const wallet of market.primarySignalWallets ?? []) {
    wallets.add(wallet.wallet.toLowerCase());
  }
  if (wallets.size > 0) return wallets.size;

  for (const outcome of market.outcomes) {
    for (const wallet of outcome.topSpecialists) wallets.add(wallet.wallet.toLowerCase());
  }
  return wallets.size;
}

function marketCohortRanks(market: SmartMoneyMarket) {
  const ranks = new Set<number>();
  const collect = (label: LeaderboardLabel) => {
    if (!isGlobalPnlLabel(label)) return;
    const rank = label.rank ?? cohortThreshold(label.id as CohortFilter);
    ranks.add(rank);
  };

  if (typeof market.exposureRank?.topCohortRank === "number" && Number.isFinite(market.exposureRank.topCohortRank)) {
    ranks.add(market.exposureRank.topCohortRank);
  }

  if (market.exposureRank?.topCohortPresent && isCohortFilter(market.exposureRank.topCohortPresent)) {
    ranks.add(market.exposureRank.topCohortRank ?? cohortThreshold(market.exposureRank.topCohortPresent));
  }

  for (const [labelId, count] of Object.entries(market.labelBreakdown ?? {})) {
    if (count > 0 && isCohortFilter(labelId)) ranks.add(cohortThreshold(labelId));
  }

  for (const wallet of [...(market.primarySignalWallets ?? []), ...(market.secondarySignalWallets ?? [])]) {
    for (const label of wallet.leaderboardLabels ?? []) collect(label);
  }
  for (const outcome of market.outcomes ?? []) {
    for (const wallet of outcome.topSpecialists ?? []) {
      for (const label of wallet.leaderboardLabels ?? []) collect(label);
    }
  }

  return Array.from(ranks);
}

function isCohortFilter(value: string): value is CohortFilter {
  return value === "top_100_pnl" || value === "top_250_pnl" || value === "top_1000_pnl";
}

function cohortThreshold(cohort: CohortFilter) {
  if (cohort === "top_100_pnl") return 100;
  if (cohort === "top_250_pnl") return 250;
  return 1000;
}

function cohortStrength(cohort: string | null | undefined) {
  if (cohort === "top_100_pnl") return 3;
  if (cohort === "top_250_pnl") return 2;
  if (cohort === "top_1000_pnl") return 1;
  return 0;
}

function compareNullableAsc(a: number | null | undefined, b: number | null | undefined) {
  const left = typeof a === "number" && Number.isFinite(a) ? a : Infinity;
  const right = typeof b === "number" && Number.isFinite(b) ? b : Infinity;
  return left - right;
}

export function marketLeaderboardLabels(market: SmartMoneyMarket, limit = 4): LeaderboardLabel[] {
  const labels = new Map<string, LeaderboardLabel>();
  for (const wallet of [...(market.primarySignalWallets ?? []), ...(market.secondarySignalWallets ?? [])]) {
    for (const label of wallet.leaderboardLabels ?? []) {
      if (!isGlobalPnlLabel(label)) continue;
      const current = labels.get(label.id);
      if (!current || (label.rank ?? Infinity) < (current.rank ?? Infinity)) labels.set(label.id, label);
    }
  }
  if (labels.size === 0 && market.exposureRank?.topCohortPresent && isCohortFilter(market.exposureRank.topCohortPresent)) {
    labels.set(market.exposureRank.topCohortPresent, {
      id: market.exposureRank.topCohortPresent,
      label: cohortLabel(market.exposureRank.topCohortPresent),
      type: "cohort_exposure",
      rank: market.exposureRank.topCohortRank ?? null,
    });
  }
  return Array.from(labels.values()).sort(compareLeaderboardLabels).slice(0, limit);
}

export function globalPnlLabels(labels: LeaderboardLabel[] | undefined) {
  return (labels ?? []).filter(isGlobalPnlLabel).sort(compareLeaderboardLabels);
}

export function compareLeaderboardLabels(a: LeaderboardLabel, b: LeaderboardLabel) {
  const tierDelta = leaderboardTier(a) - leaderboardTier(b);
  if (tierDelta !== 0) return tierDelta;
  return (a.rank ?? Infinity) - (b.rank ?? Infinity);
}

function leaderboardTier(label: LeaderboardLabel) {
  if (label.id === "top_100_pnl") return 0;
  if (label.id === "top_250_pnl") return 1;
  if (label.id === "top_1000_pnl") return 2;
  return 3;
}


function isGlobalPnlLabel(label: LeaderboardLabel) {
  return label.id === "top_100_pnl" || label.id === "top_250_pnl" || label.id === "top_1000_pnl";
}

export function leadingOutcome(market: SmartMoneyMarket) {
  return [...market.outcomes].sort((a, b) => b.specialistCount - a.specialistCount)[0] ?? null;
}

export type MarketGap = {
  outcome: string;
  smartShare: number;
  marketPrice: number | null;
  gap: number | null;
  weightedSmartSize?: number;
  holderSize: number;
  holderCount: number;
};

export function marketDiscrepancy(market: SmartMoneyMarket): MarketGap {
  return marketOutcomeGaps(market)[0] ?? {
    outcome: "market",
    smartShare: 0,
    marketPrice: null,
    gap: null,
    holderSize: 0,
    holderCount: 0,
  };
}

export function marketOutcomeGaps(market: SmartMoneyMarket): MarketGap[] {
  if (Array.isArray(market.smartGap) && market.smartGap.length > 0) {
    return market.smartGap
      .map((row) => ({
        outcome: row.outcome,
        smartShare: row.smartShare,
        marketPrice: row.marketPrice,
        gap: row.gap,
        weightedSmartSize: row.weightedSmartSize,
        holderSize: row.holderSize,
        holderCount: row.holderCount,
      }))
      .sort((a, b) => gapMagnitude(b.gap) - gapMagnitude(a.gap));
  }

  const totalSize = market.outcomes.reduce((sum, outcome) => sum + (outcome.totalCostBasis ?? outcome.totalCurrentSize), 0);
  return market.outcomes
    .map((outcome) => {
      const weightedSmartSize = outcome.totalCostBasis ?? outcome.totalCurrentSize;
      const smartShare = totalSize > 0 ? weightedSmartSize / totalSize : 0;
      const marketPrice = priceForOutcome(market.currentPrices, outcome.outcome);
      return {
        outcome: outcome.outcome,
        smartShare,
        marketPrice,
        gap: typeof marketPrice === "number" ? smartShare - marketPrice : null,
        weightedSmartSize,
        holderSize: weightedSmartSize,
        holderCount: outcome.specialistCount,
      };
    })
    .sort((a, b) => gapMagnitude(b.gap) - gapMagnitude(a.gap));
}

export function priceForOutcome(prices: Record<string, unknown>, outcome: string) {
  const normalizedOutcome = outcome.toLowerCase();
  const exact = Object.entries(prices).find(([key]) => key.toLowerCase() === normalizedOutcome);
  const exactPrice = toMarketNumber(exact?.[1]);
  if (typeof exactPrice === "number") return exactPrice;
  return toMarketNumber(Object.values(prices)[0]);
}

export function formatSignedPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const percent = value * 100;
  const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

export function pricePercent(price: unknown) {
  const value = toMarketNumber(price);
  if (typeof value !== "number") return 0;
  return Math.max(0, Math.min(100, value * 100));
}

export function formatCurrency(value: number | string | null | undefined) {
  const numberValue = toMarketNumber(value);
  if (typeof numberValue !== "number") return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(numberValue) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numberValue) >= 1000000 ? 1 : 0,
  }).format(numberValue);
}

export function formatPercent(value: number | string | null | undefined) {
  const numberValue = toMarketNumber(value);
  if (typeof numberValue !== "number") return "--";
  return `${Math.round(numberValue * 100)}%`;
}

export function formatEntry(value: number | string | null | undefined) {
  const numberValue = toMarketNumber(value);
  if (typeof numberValue !== "number") return "n/a";
  return `${Math.round(numberValue * 100)}c`;
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  const delta = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function marketDetailPath(market: Pick<SmartMoneyMarket, "marketSlug" | "conditionId">) {
  return `/markets/${encodeURIComponent(market.marketSlug || market.conditionId)}`;
}

function toMarketNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function gapMagnitude(value: number | null) {
  return typeof value === "number" ? Math.abs(value) : -1;
}
