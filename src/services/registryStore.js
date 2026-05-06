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
    this.audit = buildAudit(this.records, positions, marketTags);
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

function buildAudit(records, positions, marketTags) {
  const categoryCounts = {};
  for (const record of records) {
    if (!record.qualifies) continue;
    categoryCounts[record.category] = (categoryCounts[record.category] ?? 0) + 1;
  }
  return {
    walletsProcessed: new Set(positions.map((position) => position.wallet.toLowerCase())).size,
    closedPositionsProcessed: positions.filter((position) => position.closed).length,
    taggedMarkets: Object.keys(marketTags).length,
    qualifiedSpecialistsByCategory: categoryCounts,
    thresholdVersion: "v1-demo",
  };
}
