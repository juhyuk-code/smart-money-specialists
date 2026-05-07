import { buildRegistryRecords, DEFAULT_THRESHOLDS } from "../domain/signal.js";

export class RegistryStore {
  constructor(api) {
    this.api = api;
    this.records = [];
    this.audit = null;
    this.refreshedAt = null;
  }

  async rebuild() {
    const refreshedAt = new Date().toISOString();
    const [{ wallets }, { positions }, { marketTags }] = await Promise.all([
      this.api.listKnownWallets(),
      this.api.listClosedPositions(),
      this.api.listClosedMarketTags(),
    ]);

    this.records = buildRegistryRecords({
      wallets,
      positions,
      marketTags,
      thresholds: DEFAULT_THRESHOLDS,
      refreshedAt,
    });
    this.refreshedAt = refreshedAt;
    this.audit = buildAudit({
      records: this.records,
      positions,
      marketTags,
      wallets,
      upstreamDiagnostics: this.api.getDiagnostics?.() ?? null,
    });
    return this.snapshot();
  }

  snapshot() {
    return {
      records: this.records,
      refreshedAt: this.refreshedAt,
      audit: this.audit,
    };
  }

  async ensureReady() {
    if (!this.refreshedAt) await this.rebuild();
    return this.snapshot();
  }
}

function buildAudit({ records, positions, marketTags, wallets, upstreamDiagnostics }) {
  const qualifiedByCategory = {};
  const recordsByCategory = {};
  const positionsByCategory = {};
  const missingTagMarketIds = new Set();
  const uniqueMarkets = new Set();
  const uniqueWalletsWithPositions = new Set();

  for (const record of records) {
    recordsByCategory[record.category] = (recordsByCategory[record.category] ?? 0) + 1;
    if (record.qualifies) qualifiedByCategory[record.category] = (qualifiedByCategory[record.category] ?? 0) + 1;
  }

  for (const position of positions) {
    uniqueMarkets.add(position.marketId);
    uniqueWalletsWithPositions.add(position.wallet.toLowerCase());
    const tags = marketTags[position.marketId] ?? [];
    if (tags.length === 0) {
      missingTagMarketIds.add(position.marketId);
      continue;
    }
    for (const tag of tags) {
      const normalized = normalizeTagForAudit(tag);
      positionsByCategory[normalized] = (positionsByCategory[normalized] ?? 0) + 1;
    }
  }

  return {
    walletsDiscovered: Object.keys(wallets).length,
    walletsWithClosedPositions: uniqueWalletsWithPositions.size,
    closedPositionsProcessed: positions.filter((position) => position.closed).length,
    uniqueClosedMarkets: uniqueMarkets.size,
    taggedMarkets: Object.keys(marketTags).length,
    missingTagMarkets: missingTagMarketIds.size,
    registryRecords: records.length,
    recordsByCategory,
    positionsByInferredCategory: positionsByCategory,
    qualifiedSpecialistsByCategory: qualifiedByCategory,
    sampleNonQualifyingRecords: records
      .filter((record) => !record.qualifies)
      .sort((a, b) => b.realizedPnl - a.realizedPnl)
      .slice(0, 10)
      .map((record) => ({
        wallet: record.knownHandle ?? record.wallet,
        category: record.category,
        realizedPnl: record.realizedPnl,
        roi: record.roi,
        closedMarkets: record.closedMarkets,
      })),
    thresholds: DEFAULT_THRESHOLDS,
    thresholdVersion: "v1-demo",
    upstreamDiagnostics,
  };
}

function normalizeTagForAudit(tag) {
  const value = String(tag).toLowerCase();
  if (/(election|president|senate|congress|government|politic)/.test(value)) return "politics";
  if (/(nba|nfl|mlb|nhl|soccer|football|ufc|tennis|sports?)/.test(value)) return "sports";
  if (/(weather|hurricane|temperature|rain|snow|storm|climate)/.test(value)) return "weather";
  if (/(crypto|bitcoin|btc|ethereum|eth|solana|sol|xrp|doge)/.test(value)) return "crypto";
  if (/(fed|federal reserve|inflation|cpi|gdp|rates?|macro|economy|unemployment)/.test(value)) return "macro";
  if (/(ai|openai|space|spacex|science|technology|tech|nasa|robot|chip)/.test(value)) return "sci-tech";
  return "uncategorized";
}
