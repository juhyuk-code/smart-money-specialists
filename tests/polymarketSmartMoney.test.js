import test from "node:test";
import assert from "node:assert/strict";

import { PolymarketApi } from "../src/data/polymarketApi.js";
import { PolymarketIntelligenceService } from "../src/services/polymarketIntelligenceService.js";
import {
  buildExposureRankedMarkets,
  buildMarketIntelligence,
  buildWalletCategoryPerformance,
  buildWalletSmartProfile,
  classifyCategoryPerformance,
  classifyWalletType,
  deriveLeaderboardLabels,
  entryPriceBucket,
  maxRoiForEntry,
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
  assert.equal(records[0].largestMarketPnlShare, 0.9);
  assert.equal(records[0].label, "insufficient_sample");
});

test("classifies directional sharps separately from bond buyers", () => {
  assert.equal(entryPriceBucket(0.35), "0.20-0.40");
  assert.equal(Math.round(maxRoiForEntry(0.96) * 10000) / 10000, 0.0417);

  assert.equal(
    classifyWalletType({
      closedMarkets: 40,
      totalStake: 20000,
      daysActive: 45,
      highProbStakeShare: 0.72,
      ultraHighProbStakeShare: 0.4,
      roi: 0.04,
    }),
    "bond_buyer",
  );

  assert.equal(
    classifyWalletType({
      closedMarkets: 40,
      totalStake: 20000,
      daysActive: 45,
      highProbStakeShare: 0.1,
      ultraHighProbStakeShare: 0.02,
      lowUpsideStakeShare: 0.04,
      averageEntry: 0.52,
      directionalStakeShare: 0.7,
      directionalClosedMarkets: 22,
      directionalRoi: 0.09,
      largestMarketPnlShare: 0.2,
      realizedPnl: 1800,
      roi: 0.09,
    }),
    "directional_sharp",
  );
});

test("derives only global PnL rank labels from leaderboard sources", () => {
  const labels = deriveLeaderboardLabels([
    { category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 88, pnl: 10_000 },
    { category: "POLITICS", timePeriod: "ALL", orderBy: "PNL", rank: 12, pnl: 4_000 },
    { category: "SPORTS", timePeriod: "ALL", orderBy: "PNL", rank: 1200, pnl: 100 },
    { category: "OVERALL", timePeriod: "MONTH", orderBy: "PNL", rank: 3, pnl: 900 },
  ]);

  assert.deepEqual(labels.map((label) => label.id), [
    "top_100_pnl",
    "top_250_pnl",
    "top_1000_pnl",
  ]);
});

test("builds smart profile metrics from uncertain entries and bond-like entries", () => {
  const wallet = "0xabc0000000000000000000000000000000000001";
  const closedPositions = Array.from({ length: 30 }, (_, index) => ({
    conditionId: `m${index}`,
    title: "Will Bitcoin close above target?",
    realizedPnl: index % 3 === 0 ? -20 : 40,
    totalBought: 200,
    avgPrice: index < 20 ? 0.45 : 0.96,
    timestamp: 1700000000 + index * 86400,
    outcome: "YES",
  }));
  const profile = buildWalletSmartProfile({ wallet, closedPositions });
  assert.equal(profile.metrics.closedMarkets, 30);
  assert.equal(profile.metrics.directionalClosedMarkets, 20);
  assert.equal(profile.metrics.highProbStakeShare, 0.3333);
  assert.ok(profile.smartScoreAdjusted > 0);
});

test("builds weighted smart gap using directional/category sharps only", () => {
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
      size: 1000,
      totalBought: 1000,
      averageEntry: 0.4,
    },
    {
      wallet: "0xbbb0000000000000000000000000000000000002",
      outcome: "YES",
      size: 500,
      totalBought: 500,
      averageEntry: 0.41,
    },
    {
      wallet: "0xccc0000000000000000000000000000000000003",
      outcome: "NO",
      size: 500,
      totalBought: 500,
      averageEntry: 0.55,
    },
    {
      wallet: "0xddd0000000000000000000000000000000000004",
      outcome: "NO",
      size: 900,
      totalBought: 900,
      averageEntry: 0.5,
    },
  ];
  const categoryPerformance = [
    {
      wallet: "0xaaa0000000000000000000000000000000000001",
      category: "macro",
      label: "category_sharp",
      walletType: "directional_sharp",
      realizedPnl: 1000,
      roi: 0.1,
      resolvedMarketCount: 10,
    },
    {
      wallet: "0xbbb0000000000000000000000000000000000002",
      category: "macro",
      label: "category_sharp",
      walletType: "directional_sharp",
      realizedPnl: 200,
      roi: 0.08,
      resolvedMarketCount: 5,
    },
    {
      wallet: "0xccc0000000000000000000000000000000000003",
      category: "macro",
      label: "category_sharp",
      walletType: "directional_sharp",
      realizedPnl: 900,
      roi: 0.09,
      resolvedMarketCount: 9,
    },
    {
      wallet: "0xddd0000000000000000000000000000000000004",
      category: "macro",
      label: "bond_buyer",
      walletType: "bond_buyer",
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
  assert.equal(scan.smartGap[0].smartShare, 0.6875);
  assert.equal(scan.smartGap[0].gap, 0.2075);
});

test("promotes top PnL leaderboard wallets into primary signal using actual notional", () => {
  const intelligence = buildMarketIntelligence({
    market: {
      conditionId: "0xmarket",
      question: "Will Trump win the election?",
      parentTags: ["politics"],
      currentPrices: { YES: 0.45, NO: 0.55 },
    },
    positions: [
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        outcome: "YES",
        size: 1000,
        averageEntry: 0.44,
      },
    ],
    categoryPerformance: [
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        category: "politics",
        label: "mixed",
        leaderboardLabels: [{ id: "top_100_pnl", label: "Top 100 PnL", type: "global_pnl", rank: 42 }],
        metrics: { realizedPnl: 100_000, roi: 0.12, closedMarkets: 12 },
      },
    ],
    registryRefreshedAt: "2026-05-12T00:00:00.000Z",
    holderSnapshotAt: "2026-05-12T00:00:00.000Z",
    now: new Date("2026-05-12T00:01:00.000Z"),
  });

  assert.equal(intelligence.primarySignalWallets.length, 1);
  assert.equal(intelligence.secondarySignalWallets.length, 0);
  assert.equal(intelligence.smartGap[0].weightedSmartSize, 440);
  assert.deepEqual(intelligence.primarySignalWallets[0].leaderboardLabels.map((label) => label.id), ["top_100_pnl"]);
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

test("Polymarket adapter saves raw payloads best-effort without blocking API results", async () => {
  let resolveSave;
  let saveStarted = false;
  const savePromise = new Promise((resolve) => {
    resolveSave = resolve;
  });
  const api = new PolymarketApi({
    rateLimitMs: 0,
    rawPayloadPersistence: "async",
    store: {
      saveRawPayload: async () => {
        saveStarted = true;
        await savePromise;
      },
    },
    fetchImpl: async () => jsonResponse([{ conditionId: "0xmarket", question: "Question?", outcomes: ["Yes", "No"], outcomePrices: ["0.5", "0.5"] }]),
  });

  const { markets } = await Promise.race([
    api.listTrendingMarkets(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("raw payload save blocked API result")), 50)),
  ]);

  assert.equal(markets.length, 1);
  assert.equal(saveStarted, true);
  assert.equal(api.getDiagnostics().rawPayloadsSaved, 0);
  resolveSave();
  await savePromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.getDiagnostics().rawPayloadsSaved, 1);
});

test("Polymarket adapter discovers leaderboard wallets and reads price history", async () => {
  const calls = [];
  const api = new PolymarketApi({
    rateLimitMs: 0,
    store: { saveRawPayload: async () => ({ id: 1 }) },
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      const parsed = new URL(url);
      if (parsed.pathname === "/v1/leaderboard") {
        assert.equal(parsed.searchParams.get("limit"), "50");
        return jsonResponse([
          {
            rank: "1",
            proxyWallet: "0xabc0000000000000000000000000000000000001",
            pnl: 1000,
            vol: 5000,
          },
        ]);
      }
      if (parsed.pathname === "/prices-history") {
        assert.equal(parsed.searchParams.get("market"), "token-1");
        return jsonResponse({ history: [{ t: 1700000000, p: 0.42 }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const discovered = await api.discoverLeaderboardWallets({
    categories: ["OVERALL"],
    timePeriods: ["MONTH"],
    orderBys: ["PNL", "VOL"],
  });
  assert.equal(discovered.wallets.length, 1);
  assert.equal(calls.filter((url) => url.pathname === "/v1/leaderboard").length, 2);

  const history = await api.getPricesHistory({ market: "token-1", startTs: 1, endTs: 2 });
  assert.deepEqual(history.history, [{ t: 1700000000, p: 0.42 }]);
});

test("Polymarket adapter fetches focused all-time PnL cohort in pages", async () => {
  const calls = [];
  const api = new PolymarketApi({
    rateLimitMs: 0,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed);
      assert.equal(parsed.pathname, "/v1/leaderboard");
      assert.equal(parsed.searchParams.get("category"), "OVERALL");
      assert.equal(parsed.searchParams.get("timePeriod"), "ALL");
      assert.equal(parsed.searchParams.get("orderBy"), "PNL");
      const offset = Number(parsed.searchParams.get("offset"));
      if (offset >= 4) return jsonResponse([]);
      return jsonResponse([
        {
          rank: offset + 1,
          proxyWallet: `0x${String(offset + 1).padStart(40, "0")}`,
          pnl: 1000 - offset,
          vol: 5000 + offset,
        },
        {
          rank: offset + 2,
          proxyWallet: `0x${String(offset + 2).padStart(40, "0")}`,
          pnl: 999 - offset,
          vol: 5001 + offset,
        },
      ]);
    },
  });

  const discovered = await api.listAllTimePnlLeaderboardCohort({ limit: 2, maxRows: 6 });

  assert.equal(discovered.wallets.length, 4);
  assert.deepEqual(calls.map((url) => Number(url.searchParams.get("offset"))), [0, 2, 4]);
  assert.deepEqual(discovered.wallets[0].sources[0], {
    category: "OVERALL",
    timePeriod: "ALL",
    orderBy: "PNL",
    rank: 1,
    pnl: 1000,
    volume: 5000,
  });
});

test("Polymarket adapter paginates and normalizes wallet current positions", async () => {
  const calls = [];
  const wallet = "0xabc0000000000000000000000000000000000001";
  const api = new PolymarketApi({
    rateLimitMs: 0,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed);
      assert.equal(parsed.pathname, "/positions");
      assert.equal(parsed.searchParams.get("user"), wallet);
      assert.equal(parsed.searchParams.get("sizeThreshold"), "5");
      const offset = Number(parsed.searchParams.get("offset"));
      if (offset === 0) {
        return jsonResponse([
          {
            proxyWallet: wallet,
            conditionId: "condition-1",
            title: "Will it rain tomorrow?",
            slug: "rain-tomorrow",
            outcome: "YES",
            size: "10",
            avgPrice: "0.40",
            curPrice: "0.55",
            currentValue: "5.5",
          },
        ]);
      }
      return jsonResponse([]);
    },
  });

  const result = await api.listCurrentPositionsForWallet(wallet, { limit: 1, maxPages: 3, sizeThreshold: 5 });

  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].conditionId, "condition-1");
  assert.equal(result.positions[0].marketSlug, "rain-tomorrow");
  assert.equal(result.positions[0].currentPrice, 0.55);
  assert.deepEqual(calls.map((url) => Number(url.searchParams.get("offset"))), [0, 1]);
});

test("builds exposure-ranked markets from cohort wallet current positions", () => {
  const walletA = "0xaaa0000000000000000000000000000000000001";
  const walletB = "0xbbb0000000000000000000000000000000000002";
  const walletC = "0xccc0000000000000000000000000000000000003";
  const leaderboardSourcesByWallet = new Map([
    [walletA, [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 42, pnl: 10_000 }]],
    [walletB, [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 220, pnl: 8_000 }]],
    [walletC, [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 800, pnl: 1_000 }]],
  ]);

  const markets = buildExposureRankedMarkets({
    positions: [
      { wallet: walletA, conditionId: "market-1", question: "Market one?", marketSlug: "one", outcome: "YES", size: 100, averageEntry: 0.4, currentPrice: 0.5, currentValue: 50 },
      { wallet: walletB, conditionId: "market-1", question: "Market one?", marketSlug: "one", outcome: "NO", size: 50, averageEntry: 0.6, currentPrice: 0.7, currentValue: 35 },
      { wallet: walletC, conditionId: "market-2", question: "Market two?", marketSlug: "two", outcome: "YES", size: 1000, averageEntry: 0.2, currentPrice: 0.2, currentValue: 200 },
    ],
    leaderboardSourcesByWallet,
    fetchedAt: "2026-05-12T00:00:00.000Z",
    registryRefreshedAt: "2026-05-12T00:00:00.000Z",
  });

  assert.equal(markets[0].conditionId, "market-1");
  assert.equal(markets[0].exposureRank.cohortWalletCount, 2);
  assert.equal(markets[0].exposureRank.topCohortPresent, "top_100_pnl");
  assert.equal(markets[0].exposureRank.currentExposure, 85);
  assert.equal(markets[0].exposureRank.outcomeConcentration, 0.5882);
  assert.deepEqual(markets[0].primarySignalWallets.map((wallet) => wallet.wallet), [walletA, walletB]);
  assert.equal(markets[1].conditionId, "market-2");
});

test("cohort exposure refresh fetches cohort positions and saves exposure-ranked snapshot", async () => {
  const walletA = "0xaaa0000000000000000000000000000000000001";
  const walletB = "0xbbb0000000000000000000000000000000000002";
  const storeCalls = [];
  const service = new PolymarketIntelligenceService(
    {
      listAllTimePnlLeaderboardCohort: async () => ({
        wallets: [
          { wallet: walletA, sources: [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 1, pnl: 1000 }] },
          { wallet: walletB, sources: [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 200, pnl: 500 }] },
        ],
        fetchedAt: "2026-05-12T00:00:00.000Z",
      }),
      listCurrentPositionsForWallet: async (wallet) => ({
        wallet,
        fetchedAt: "2026-05-12T00:01:00.000Z",
        positions: [
          { wallet, conditionId: "condition-1", question: "Market?", marketSlug: "market", outcome: wallet === walletA ? "YES" : "NO", size: 100, averageEntry: 0.5, currentValue: 50 },
        ],
      }),
      getDiagnostics: () => ({ requests: 3 }),
    },
    {
      isAvailable: () => true,
      upsertWalletLeaderboardSources: async (wallets) => storeCalls.push(["leaderboard", wallets.length]),
      upsertWalletCandidates: async (wallets, source) => storeCalls.push(["candidates", wallets.length, source]),
      saveCohortCurrentPositions: async ({ wallet, positions }) => storeCalls.push(["positions", wallet, positions.length]),
      upsertMarkets: async (markets) => storeCalls.push(["markets", markets.length]),
      saveMarketIntelligence: async (markets) => storeCalls.push(["intelligence", markets.length]),
      pruneMarketIntelligenceExcept: async (ids) => storeCalls.push(["prune", ids]),
    },
  );

  const result = await service.refreshCohortExposureMarkets({ cohortLimit: 2, positionPageLimit: 1 });

  assert.equal(result.mode, "cohort_exposure");
  assert.equal(result.markets.length, 1);
  assert.equal(result.markets[0].exposureRank.cohortWalletCount, 2);
  assert.ok(storeCalls.some((call) => call[0] === "positions" && call[2] === 1));
  assert.ok(storeCalls.some((call) => call[0] === "intelligence" && call[1] === 1));
});

test("Polymarket adapter pages leaderboard discovery and records source rank", async () => {
  const calls = [];
  const api = new PolymarketApi({
    rateLimitMs: 0,
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/v1/leaderboard");
      const offset = Number(parsed.searchParams.get("offset"));
      if (offset === 0) {
        return jsonResponse([
          {
            rank: 1,
            proxyWallet: "0xabc0000000000000000000000000000000000001",
            pnl: 1000,
            vol: 5000,
          },
        ]);
      }
      if (offset === 1) {
        return jsonResponse([
          {
            rank: 2,
            proxyWallet: "0xdef0000000000000000000000000000000000002",
            pnl: 900,
            vol: 4000,
          },
        ]);
      }
      return jsonResponse([]);
    },
  });

  const discovered = await api.discoverLeaderboardWallets({
    categories: ["OVERALL"],
    timePeriods: ["ALL"],
    orderBys: ["PNL"],
    limit: 1,
    maxRowsPerSlice: 3,
  });

  assert.equal(discovered.wallets.length, 2);
  assert.deepEqual(
    discovered.wallets.map((wallet) => wallet.sources[0].rank),
    [1, 2],
  );
  assert.deepEqual(
    calls.map((url) => Number(url.searchParams.get("offset"))),
    [0, 1, 2],
  );
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
