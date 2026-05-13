import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEnrichedWalletDetail,
  buildFeed,
  buildLeaders,
  buildMarketDetail,
  buildWalletDetail,
  buildWalletIndex,
} from "../src/services/internalSurfaces.js";

const markets = [
  {
    conditionId: "condition-1",
    marketSlug: "market-one",
    question: "Market one?",
    currentPrices: { YES: 0.6, NO: 0.4 },
    parentTags: ["politics"],
    volume24h: 1000,
    marketDataRefreshedAt: "2026-05-07T00:00:00.000Z",
    outcomes: [
      {
        outcome: "YES",
        specialistCount: 1,
        totalCurrentSize: 100,
        weightedAverageEntry: 0.5,
        topSpecialists: [
          {
            wallet: "0xabc",
            displayLabel: "alpha",
            knownHandle: "alpha",
            category: "politics",
            currentOutcome: "YES",
            currentSize: 100,
            averageEntry: 0.5,
            realizedPnl: 20,
            roi: 0.2,
            closedMarkets: 3,
            last90dPnl: 15,
          },
        ],
      },
    ],
  },
  {
    conditionId: "condition-2",
    marketSlug: "market-two",
    question: "Market two?",
    currentPrices: { YES: 0.4, NO: 0.6 },
    parentTags: ["crypto"],
    volume24h: 2000,
    marketDataRefreshedAt: "2026-05-07T01:00:00.000Z",
    outcomes: [
      {
        outcome: "NO",
        specialistCount: 2,
        totalCurrentSize: 250,
        weightedAverageEntry: 0.7,
        topSpecialists: [
          {
            wallet: "0xabc",
            displayLabel: "alpha",
            knownHandle: "alpha",
            category: "crypto",
            currentOutcome: "NO",
            currentSize: 150,
            averageEntry: 0.7,
            realizedPnl: 30,
            roi: 0.1,
            closedMarkets: 4,
            last90dPnl: 20,
          },
          {
            wallet: "0xdef",
            displayLabel: "beta",
            knownHandle: null,
            category: "crypto",
            currentOutcome: "NO",
            currentSize: 100,
            averageEntry: 0.72,
            realizedPnl: 5,
            roi: 0.05,
            closedMarkets: 2,
            last90dPnl: 4,
          },
        ],
      },
    ],
  },
];

test("buildLeaders aggregates specialists by wallet", () => {
  const leaders = buildLeaders(markets);
  assert.equal(leaders.length, 2);
  assert.equal(leaders[0].wallet, "0xabc");
  assert.equal(leaders[0].activeMarkets, 2);
  assert.equal(leaders[0].totalCurrentSize, 250);
  assert.equal(leaders[0].realizedPnl, 50);
  assert.deepEqual(leaders[0].categories, ["crypto", "politics"]);
});

test("buildWalletIndex returns compact wallet rows", () => {
  const wallets = buildWalletIndex(markets);
  assert.equal(wallets[0].wallet, "0xabc");
  assert.equal(wallets[0].activeMarkets, 2);
  assert.equal(wallets[0].markets, undefined);
});

test("buildWalletDetail returns positions for one wallet", () => {
  const wallet = buildWalletDetail(markets, "0xabc");
  assert.equal(wallet.positions.length, 2);
  assert.equal(wallet.positions[0].marketSlug, "market-one");
});

test("buildEnrichedWalletDetail merges direct wallet data into the profile contract", async () => {
  const walletId = "0xabc0000000000000000000000000000000000001";
  const result = await buildEnrichedWalletDetail(markets, walletId, {
    now: new Date("2026-05-13T00:00:00.000Z"),
    store: {
      readLeaderboardSourcesByWallets: async () => new Map([
        [walletId, [{ category: "OVERALL", timePeriod: "ALL", orderBy: "PNL", rank: 42, pnl: 5000 }]],
      ]),
    },
    api: {
      listCurrentPositionsForWallet: async () => ({
        wallet: walletId,
        fetchedAt: "2026-05-12T00:00:00.000Z",
        positions: [
          {
            wallet: walletId,
            conditionId: "condition-direct",
            marketSlug: "direct-market",
            slug: "direct-market",
            question: "Direct current market?",
            title: "Direct current market?",
            outcome: "YES",
            size: 20,
            currentValue: 12,
            averageEntry: 0.4,
            currentPrice: 0.6,
          },
        ],
      }),
      listClosedPositionsForWallet: async () => ({
        wallet: walletId,
        positions: [
          { wallet: walletId, conditionId: "old-win", title: "Old win", slug: "old-win", outcome: "YES", realizedPnl: 200, totalBought: 500, timestamp: 1764547200 },
          { wallet: walletId, conditionId: "recent-win", title: "Recent win", slug: "recent-win", outcome: "NO", realizedPnl: 100, totalBought: 200, timestamp: 1777593600 },
          { wallet: walletId, conditionId: "ninety-loss", title: "90D loss", slug: "ninety-loss", outcome: "YES", realizedPnl: -20, totalBought: 100, timestamp: 1772323200 },
        ],
      }),
    },
  });

  assert.equal(result.wallet, walletId);
  assert.equal(result.polymarketProfileUrl, `https://polymarket.com/profile/${walletId}`);
  assert.equal(result.positions[0].conditionId, "condition-direct");
  assert.equal(result.positions[0].marketSlug, "direct-market");
  assert.deepEqual(result.closedPositions.map((position) => position.conditionId), ["old-win", "recent-win", "ninety-loss"]);
  assert.equal(result.pnlSummary.last30d.realizedPnl, 100);
  assert.equal(result.pnlSummary.last90d.realizedPnl, 80);
  assert.equal(result.pnlSummary.lifetime.realizedPnl, 280);
  assert.equal(result.pnlSeries.length, 3);
  assert.ok(result.labels.some((label) => label.id === "top_100_pnl"));
});

test("buildFeed returns specialist market events newest first", () => {
  const feed = buildFeed(markets);
  assert.equal(feed.length, 3);
  assert.equal(feed[0].market.marketSlug, "market-two");
  assert.equal(feed[0].outcome, "NO");
});

test("buildMarketDetail returns a market by slug or condition id", () => {
  assert.equal(buildMarketDetail(markets, "market-one").conditionId, "condition-1");
  assert.equal(buildMarketDetail(markets, "condition-2").marketSlug, "market-two");
  assert.equal(buildMarketDetail(markets, "missing"), null);
});
