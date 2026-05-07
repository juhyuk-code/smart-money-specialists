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
