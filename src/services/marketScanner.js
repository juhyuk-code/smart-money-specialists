import { buildHeadline, isBtcUpDownMarket, summarizeMarketScan } from "../domain/signal.js";

export class MarketScanner {
  constructor(api, registryStore) {
    this.api = api;
    this.registryStore = registryStore;
    this.cache = new Map();
    this.cacheMs = 90_000;
  }

  async scanDefaultMarkets() {
    const [{ markets }, registry] = await Promise.all([
      this.api.listTrendingMarkets(),
      this.registryStore.ensureReady(),
    ]);
    const filtered = markets.filter((market) => !isBtcUpDownMarket(market)).slice(0, 40);
    const results = await Promise.all(filtered.map((market) => this.scanMarket(market.conditionId, market, registry)));
    return {
      registryRefreshedAt: registry.refreshedAt,
      markets: results.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)),
    };
  }

  async scanConditionId(conditionId) {
    const [{ markets }, registry] = await Promise.all([
      this.api.listTrendingMarkets(),
      this.registryStore.ensureReady(),
    ]);
    const market = markets.find((candidate) => candidate.conditionId === conditionId);
    if (!market) return null;
    return this.scanMarket(conditionId, market, registry);
  }

  async customScan(url) {
    if (!/^https?:\/\/(www\.)?polymarket\.com\//i.test(url)) {
      return { status: "market_metadata_unavailable", error: "Paste a Polymarket market URL.", markets: [] };
    }
    const resolved = await this.api.resolvePolymarketUrl(url);
    if (resolved.error || resolved.conditionIds.length === 0) {
      return { status: "market_metadata_unavailable", error: "We could not resolve this market yet.", markets: [] };
    }
    const markets = await Promise.all(resolved.conditionIds.map((conditionId) => this.scanConditionId(conditionId)));
    return { status: "ready", error: null, markets: markets.filter(Boolean) };
  }

  async scanMarket(conditionId, market, registry) {
    const cached = this.cache.get(conditionId);
    if (cached && Date.now() - cached.cachedAt < this.cacheMs) return cached.result;

    try {
      const { holders, fetchedAt } = await this.api.listTopHolders(conditionId);
      const result = summarizeMarketScan({
        market,
        registry: registry.records,
        holders,
        holderFetchedAt: fetchedAt,
        registryRefreshedAt: registry.refreshedAt,
      });
      const withHeadline = { ...result, headline: buildHeadline(result) };
      this.cache.set(conditionId, { cachedAt: Date.now(), result: withHeadline });
      return withHeadline;
    } catch (error) {
      return {
        conditionId,
        marketSlug: market.slug ?? null,
        question: market.question,
        currentPrices: market.currentPrices,
        parentTags: [],
        volume24h: market.volume24h ?? null,
        outcomes: [],
        status: "holder_fetch_failed",
        registryRefreshedAt: registry.refreshedAt,
        marketDataRefreshedAt: new Date().toISOString(),
        headline: "Holder data unavailable",
      };
    }
  }
}
