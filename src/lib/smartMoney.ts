export type Specialist = {
  wallet: string;
  displayLabel: string;
  knownHandle?: string;
  category?: string;
  currentOutcome: string;
  currentSize: number;
  averageEntry: number | null;
  realizedPnl: number;
  roi: number;
  closedMarkets: number;
  last90dPnl: number;
};

export type MarketOutcome = {
  outcome: string;
  specialistCount: number;
  totalCurrentSize: number;
  weightedAverageEntry: number | null;
  averageEntryStatus?: string;
  topSpecialists: Specialist[];
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
  headline: string;
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
  realizedPnl: number;
  last90dPnl: number;
  closedMarkets: number;
  roi: number;
  markets: Array<{
    conditionId: string;
    marketSlug: string;
    question: string;
    outcome: string;
    currentSize: number;
    averageEntry: number | null;
    realizedPnl: number;
    roi: number;
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
  realizedPnl: number;
  roi: number;
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
  const response = await fetch("/api/smart-money/leaders", { headers: { accept: "application/json" } });
  const data = await response.json();
  return Array.isArray(data.leaders) ? data.leaders : [];
}

export async function fetchFeed(): Promise<FeedEvent[]> {
  const response = await fetch("/api/smart-money/feed", { headers: { accept: "application/json" } });
  const data = await response.json();
  return Array.isArray(data.feed) ? data.feed : [];
}

export async function fetchWallets(): Promise<WalletRow[]> {
  const response = await fetch("/api/smart-money/wallets", { headers: { accept: "application/json" } });
  const data = await response.json();
  return Array.isArray(data.wallets) ? data.wallets : [];
}

export async function fetchWalletDetail(wallet: string): Promise<WalletDetail | null> {
  const response = await fetch(`/api/smart-money/wallets/${encodeURIComponent(wallet)}`, {
    headers: { accept: "application/json" },
  });
  const data = await response.json();
  return data.wallet ?? null;
}

export function specialistCount(market: SmartMoneyMarket) {
  return market.outcomes.reduce((sum, outcome) => sum + outcome.specialistCount, 0);
}

export function leadingOutcome(market: SmartMoneyMarket) {
  return [...market.outcomes].sort((a, b) => b.specialistCount - a.specialistCount)[0] ?? null;
}

export function pricePercent(price: number | undefined) {
  if (typeof price !== "number" || Number.isNaN(price)) return 0;
  return Math.max(0, Math.min(100, price * 100));
}

export function formatCurrency(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000000 ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function formatEntry(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100)}c`;
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
