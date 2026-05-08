export type Specialist = {
  wallet: string;
  displayLabel: string;
  knownHandle?: string;
  category?: string;
  label?: string;
  labelWeight?: number;
  currentOutcome: string;
  currentSize: number;
  averageEntry: number | null;
  realizedPnl: number | null;
  roi: number | null;
  closedMarkets: number | null;
  resolvedNotional?: number | null;
  winRate?: number | null;
  topGainConcentration?: number | null;
  last90dPnl: number | null;
};

export type MarketOutcome = {
  outcome: string;
  specialistCount: number;
  totalCurrentSize: number;
  weightedSmartSize?: number;
  weightedAverageEntry: number | null;
  averageEntryStatus?: string;
  topSpecialists: Specialist[];
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
};

export type MarketsPayload = {
  dataSource?: string;
  registryRefreshedAt: string | null;
  markets: SmartMoneyMarket[];
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
  markets: Array<{
    conditionId: string;
    marketSlug: string;
    question: string;
    outcome: string;
    currentSize: number;
    averageEntry: number | null;
    realizedPnl: number | null;
    roi: number | null;
    volume24h: number;
    parentTags: string[];
    currentPrices: Record<string, number>;
  }>;
  outcomes: string[];
};

export type WalletRow = Omit<Leader, "markets" | "outcomes" | "closedMarkets">;
export type WalletDetail = Leader & {
  positions: Leader["markets"];
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

export const SNAPSHOT_KEY = "pref:last-market-snapshot";
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
  try {
    const rawSnapshot = window.localStorage.getItem(SNAPSHOT_KEY) ?? window.localStorage.getItem(LEGACY_SNAPSHOT_KEY);
    const parsed = JSON.parse(rawSnapshot ?? "null");
    if (!parsed || !Array.isArray(parsed.markets) || parsed.markets.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
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

export async function fetchMarkets(): Promise<MarketsPayload | null> {
  const response = await fetch("/api/smart-money/markets", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.markets) || data.markets.length === 0) return null;
  return {
    dataSource: data.dataSource,
    registryRefreshedAt: data.registryRefreshedAt,
    markets: data.markets,
  };
}

export async function scanCustomMarket(url: string): Promise<MarketsPayload | null> {
  const response = await fetch("/api/smart-money/custom-scan", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.markets) || data.markets.length === 0) return null;
  return {
    dataSource: data.dataSource,
    registryRefreshedAt: data.registryRefreshedAt ?? data.markets[0]?.registryRefreshedAt ?? null,
    markets: data.markets,
  };
}

export async function fetchLeaders(): Promise<Leader[]> {
  try {
    const response = await fetch("/api/smart-money/leaders", { headers: { accept: "application/json" } });
    const data = await response.json();
    const leaders = Array.isArray(data.leaders) ? data.leaders : [];
    saveClientSnapshot(LEADERS_SNAPSHOT_KEY, leaders, isLeaderArray);
    return leaders.length > 0 ? leaders : readClientSnapshot(LEADERS_SNAPSHOT_KEY, isLeaderArray) ?? [];
  } catch {
    return readClientSnapshot(LEADERS_SNAPSHOT_KEY, isLeaderArray) ?? [];
  }
}

export async function fetchFeed(): Promise<FeedEvent[]> {
  try {
    const response = await fetch("/api/smart-money/feed", { headers: { accept: "application/json" } });
    const data = await response.json();
    const feed = Array.isArray(data.feed) ? data.feed : [];
    saveClientSnapshot(FEED_SNAPSHOT_KEY, feed, isFeedArray);
    return feed.length > 0 ? feed : readClientSnapshot(FEED_SNAPSHOT_KEY, isFeedArray) ?? [];
  } catch {
    return readClientSnapshot(FEED_SNAPSHOT_KEY, isFeedArray) ?? [];
  }
}

export async function fetchWallets(): Promise<WalletRow[]> {
  try {
    const response = await fetch("/api/smart-money/wallets", { headers: { accept: "application/json" } });
    const data = await response.json();
    const wallets = Array.isArray(data.wallets) ? data.wallets : [];
    saveClientSnapshot(WALLETS_SNAPSHOT_KEY, wallets, isWalletArray);
    return wallets.length > 0 ? wallets : readClientSnapshot(WALLETS_SNAPSHOT_KEY, isWalletArray) ?? [];
  } catch {
    return readClientSnapshot(WALLETS_SNAPSHOT_KEY, isWalletArray) ?? [];
  }
}

export async function fetchWalletDetail(wallet: string): Promise<WalletDetail | null> {
  const cacheKey = `${WALLET_DETAIL_SNAPSHOT_PREFIX}${wallet.toLowerCase()}`;
  try {
    const response = await fetch(`/api/smart-money/wallets/${encodeURIComponent(wallet)}`, {
      headers: { accept: "application/json" },
    });
    const data = await response.json();
    if (data.wallet) saveClientSnapshot(cacheKey, data.wallet, isWalletDetail);
    return data.wallet ?? readClientSnapshot(cacheKey, isWalletDetail);
  } catch {
    return readClientSnapshot(cacheKey, isWalletDetail);
  }
}

export async function fetchMarketDetail(marketId: string): Promise<SmartMoneyMarket | null> {
  const response = await fetch(`/api/smart-money/markets/${encodeURIComponent(marketId)}`, {
    headers: { accept: "application/json" },
  });
  const data = await response.json();
  return data.market ?? null;
}

export function specialistCount(market: SmartMoneyMarket) {
  return market.outcomes.reduce((sum, outcome) => sum + outcome.specialistCount, 0);
}

export function leadingOutcome(market: SmartMoneyMarket) {
  return [...market.outcomes].sort((a, b) => b.specialistCount - a.specialistCount)[0] ?? null;
}

export type MarketGap = {
  outcome: string;
  smartShare: number;
  marketPrice: number | null;
  gap: number | null;
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
        holderSize: row.holderSize,
        holderCount: row.holderCount,
      }))
      .sort((a, b) => gapMagnitude(b.gap) - gapMagnitude(a.gap));
  }

  const totalSize = market.outcomes.reduce((sum, outcome) => sum + outcome.totalCurrentSize, 0);
  return market.outcomes
    .map((outcome) => {
      const smartShare = totalSize > 0 ? outcome.totalCurrentSize / totalSize : 0;
      const marketPrice = priceForOutcome(market.currentPrices, outcome.outcome);
      return {
        outcome: outcome.outcome,
        smartShare,
        marketPrice,
        gap: typeof marketPrice === "number" ? smartShare - marketPrice : null,
        holderSize: outcome.totalCurrentSize,
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
