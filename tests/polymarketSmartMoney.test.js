import test from "node:test";
import assert from "node:assert/strict";

import { PolymarketApi } from "../src/data/polymarketApi.js";
import {
  buildMarketIntelligence,
  buildWalletCategoryPerformance,
  classifyCategoryPerformance,
} from "../src/domain/polymarketSmartMoney.js";

test("classifies proven, emerging, and concentrated category records distinctly", () => {
  assert.equal(
    classifyCategoryPerformance({
      resolvedMarketCount: 8,
      resolvedNotional: 1200,
      realizedPnl: 600,
      roi: 0.08,
      winRate: 0.625,
      topGainConcentration: 0.48,
    }),
    "proven_specialist",
  );

  assert.equal(
    classifyCategoryPerformance({
      resolvedMarketCount: 5,
      resolvedNotional: 700,
      realizedPnl: 160,
      roi: 0.08,
      winRate: 0.6,
      topGainConcentration: 0.5,
    }),
    "emerging_specialist",
  );

  assert.equal(
    classifyCategoryPerformance({
      resolvedMarketCount: 9,
      resolvedNotional: 4000,
      realizedPnl: 1200,
      roi: 0.3,
      winRate: 0.78,
      topGainConcentration: 0.8,
    }),
    "one_hit_wonder",
  );
});

test("computes category performance concentration from resolved market PnL", () => {
  const records = buildWalletCategoryPerformance({
    wallet: "0xabc0000000000000000000000000000000000001",
    closedPositions: [
      {
        conditionId: "m1",
        title: "Will Trump win the election?",
        realizedPnl: 900,
        totalBought: 1000,
        timestamp: 1700000000,
      },
      {
        conditionId: "m2",
        title: "Will Democrats control the Senate?",
        realizedPnl: 100,
        totalBought: 1000,
        timestamp: 1700000100,
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].category, "politics");
  assert.equal(records[0].topGainConcentration, 0.9);
  assert.equal(records[0].label, "one_hit_wonder");
});

test("builds weighted smart gap using proven and emerging specialists only", () => {
  const market = {
    conditionId: "0xmarket",
    marketSlug: "fed-cut",
    question: "Will the Fed cut rates?",
    currentPrices: { YES: 0.48, NO: 0.52 },
    parentTags: ["macro"],
    volume24h: 1000,
  };
  const positions = [
    {
      wallet: "0xaaa0000000000000000000000000000000000001",
      outcome: "YES",
      size: 100,
      averageEntry: 0.4,
    },
    {
      wallet: "0xbbb0000000000000000000000000000000000002",
      outcome: "YES",
      size: 50,
      averageEntry: 0.41,
    },
    {
      wallet: "0xccc0000000000000000000000000000000000003",
      outcome: "NO",
      size: 50,
      averageEntry: 0.55,
    },
    {
      wallet: "0xddd0000000000000000000000000000000000004",
      outcome: "NO",
      size: 900,
      averageEntry: 0.5,
    },
  ];
  const categoryPerformance = [
    {
      wallet: "0xaaa0000000000000000000000000000000000001",
      category: "macro",
      label: "proven_specialist",
      realizedPnl: 1000,
      roi: 0.1,
      resolvedMarketCount: 10,
    },
    {
      wallet: "0xbbb0000000000000000000000000000000000002",
      category: "macro",
      label: "emerging_specialist",
      realizedPnl: 200,
      roi: 0.08,
      resolvedMarketCount: 5,
    },
    {
      wallet: "0xccc0000000000000000000000000000000000003",
      category: "macro",
      label: "proven_specialist",
      realizedPnl: 900,
      roi: 0.09,
      resolvedMarketCount: 9,
    },
    {
      wallet: "0xddd0000000000000000000000000000000000004",
      category: "macro",
      label: "one_hit_wonder",
      realizedPnl: 3000,
      roi: 0.9,
      resolvedMarketCount: 1,
    },
  ];

  const scan = buildMarketIntelligence({
    market,
    positions,
    categoryPerformance,
    registryRefreshedAt: "2026-05-08T00:00:00.000Z",
    holderSnapshotAt: "2026-05-08T00:01:00.000Z",
    now: new Date("2026-05-08T00:02:00.000Z"),
  });

  assert.equal(scan.status, "ready");
  assert.equal(scan.primarySignalWallets.length, 3);
  assert.equal(scan.secondarySignalWallets.length, 1);
  assert.equal(scan.smartGap[0].outcome, "YES");
  assert.equal(scan.smartGap[0].smartShare, 0.7143);
  assert.equal(scan.smartGap[0].gap, 0.2343);
});

test("Polymarket adapter uses market positions for top outcome holders and paginates closed positions", async () => {
  const calls = [];
  const api = new PolymarketApi({
    rateLimitMs: 0,
    store: { saveRawPayload: async () => ({ id: 1 }) },
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/market-positions") {
        assert.equal(parsed.searchParams.get("limit"), "100");
        assert.equal(parsed.searchParams.get("status"), "OPEN");
        return jsonResponse([
          {
            token: "yes-token",
            positions: [
              {
                proxyWallet: "0xabc0000000000000000000000000000000000001",
                outcome: "YES",
                size: 10,
                avgPrice: 0.4,
              },
            ],
          },
        ]);
      }
      if (parsed.pathname === "/closed-positions") {
        const offset = Number(parsed.searchParams.get("offset"));
        const rows = offset === 0 ? Array.from({ length: 50 }, (_, index) => closedPosition(index)) : [closedPosition(50)];
        return jsonResponse(rows);
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const holders = await api.listMarketPositions("0xmarket");
  assert.equal(holders.positions.length, 1);
  assert.equal(holders.positions[0].averageEntry, 0.4);

  const closed = await api.listClosedPositionsForWallet("0xabc0000000000000000000000000000000000001");
  assert.equal(closed.positions.length, 51);
  assert.equal(calls.filter((url) => url.pathname === "/closed-positions").length, 2);
});

function closedPosition(index) {
  return {
    proxyWallet: "0xabc0000000000000000000000000000000000001",
    conditionId: `0x${String(index).padStart(64, "0")}`,
    avgPrice: 0.5,
    totalBought: 100,
    realizedPnl: index % 2 === 0 ? 10 : -5,
    timestamp: 1700000000 + index,
    title: "Will CPI be above forecast?",
    slug: `market-${index}`,
    outcome: "YES",
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
