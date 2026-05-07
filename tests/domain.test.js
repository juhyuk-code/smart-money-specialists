import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHeadline,
  buildRegistryRecords,
  isBtcUpDownMarket,
  normalizeParentTags,
  summarizeMarketScan,
  truncateWallet,
} from "../src/domain/signal.js";
import { PreferenceMcpApi } from "../src/data/preferenceMcpApi.js";

test("normalizes raw market tags to supported parent categories", () => {
  assert.deepEqual(normalizeParentTags(["US Election", "Federal Reserve", "bitcoin"]), [
    "politics",
    "macro",
    "crypto",
  ]);
});

test("filters short-horizon BTC up/down markets from the default scan", () => {
  assert.equal(
    isBtcUpDownMarket({ question: "Bitcoin Up or Down - May 6, 1PM ET", rawTags: ["crypto"] }),
    true,
  );
  assert.equal(
    isBtcUpDownMarket({ question: "Will Ethereum ETF volume exceed $1B this week?", rawTags: ["crypto"] }),
    false,
  );
});

test("builds multi-tag specialist registry records with category thresholds", () => {
  const records = buildRegistryRecords({
    wallets: {
      "0xabc0000000000000000000000000000000000001": {
        knownHandle: "@macroAce",
        candidateSources: ["known_kol"],
      },
    },
    positions: [
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        marketId: "m1",
        closed: true,
        realizedPnl: 400,
        volume: 2000,
        isRecent90d: true,
      },
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        marketId: "m2",
        closed: true,
        realizedPnl: 400,
        volume: 2000,
        isRecent90d: true,
      },
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        marketId: "m3",
        closed: true,
        realizedPnl: 400,
        volume: 2000,
        isRecent90d: false,
      },
    ],
    marketTags: {
      m1: ["US Election", "Federal Reserve"],
      m2: ["US Election", "Federal Reserve"],
      m3: ["US Election", "Federal Reserve"],
    },
    thresholds: {
      politics: { minPnl: 1000, minRoi: 0.1, minClosedMarkets: 3 },
      macro: { minPnl: 1000, minRoi: 0.1, minClosedMarkets: 3 },
    },
    refreshedAt: "2026-05-06T12:00:00.000Z",
  });

  const politics = records.find((record) => record.category === "politics");
  const macro = records.find((record) => record.category === "macro");
  assert.equal(politics.qualifies, true);
  assert.equal(macro.qualifies, true);
  assert.equal(politics.closedMarkets, 3);
  assert.equal(politics.last90dPnl, 800);
});

test("summarizes current holders into outcome specialist counts and headline", () => {
  const scan = summarizeMarketScan({
    market: {
      conditionId: "c1",
      slug: "fed-cut",
      question: "Will the Fed cut rates this year?",
      rawTags: ["Federal Reserve"],
      currentPrices: { YES: 0.42, NO: 0.58 },
      volume24h: 420000,
    },
    registry: [
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        category: "macro",
        realizedPnl: 1400,
        roi: 0.2,
        closedMarkets: 6,
        last90dPnl: 600,
        knownHandle: "@macroAce",
        qualifies: true,
      },
    ],
    holders: [
      {
        wallet: "0xabc0000000000000000000000000000000000001",
        outcome: "YES",
        size: 1200,
        averageEntry: 0.31,
      },
    ],
    registryRefreshedAt: "2026-05-06T12:00:00.000Z",
    holderFetchedAt: "2026-05-06T12:01:00.000Z",
  });

  assert.equal(scan.status, "ready");
  assert.equal(scan.outcomes[0].specialistCount, 1);
  assert.equal(scan.outcomes[0].weightedAverageEntry, 0.31);
  assert.equal(buildHeadline(scan), "1 macro specialists YES @ avg 31c");
});

test("keeps privacy-safe wallet labels", () => {
  assert.equal(truncateWallet("0xabc0000000000000000000000000000000000001"), "0xabc0...0001");
});

test("preference adapter maps MCP market and holder payloads to app shapes", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId, args) => {
      if (capabilityId === "polymarket.discovery.search_markets" && args.query === "will") {
        assert.equal(args.order, "volume24hr");
        return {
          markets: [
            {
              id: "573655",
              slug: "will-bitcoin-hit-150k-by-june-30-2026",
              question: "Will Bitcoin hit $150k by June 30, 2026?",
              volume24hr: "5821652.894196",
            },
          ],
        };
      }
      if (capabilityId === "polymarket.discovery.search_markets") {
        return {
          markets: [
            {
              id: "573655",
              slug: "will-bitcoin-hit-150k-by-june-30-2026",
              question: "Will Bitcoin hit $150k by June 30, 2026?",
              outcomes: ["Yes", "No"],
              outcomePrices: [0.0135, 0.9865],
              conditionId: "0xa0f4c4924ea1a8b410b4ce821c2a9955fad21a1b19bdcfde90816732278b3dd5",
              volume24hr: 5821652.894196,
            },
          ],
        };
      }
      if (capabilityId === "wallet.scrape.get_market_kol_holders") {
        assert.equal(args.condition_id, "0xa0f4c4924ea1a8b410b4ce821c2a9955fad21a1b19bdcfde90816732278b3dd5");
        return {
          holders_by_outcome: {
            Yes: [
              {
                address_normalized: "0xd235973291b2b75ff4070e9c0b01728c520b0f29",
                size: "1200",
                average_entry: "0.02",
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected capability ${capabilityId}`);
    },
  });

  const { markets } = await api.listTrendingMarkets();
  assert.deepEqual(markets[0], {
    conditionId: "0xa0f4c4924ea1a8b410b4ce821c2a9955fad21a1b19bdcfde90816732278b3dd5",
    slug: "will-bitcoin-hit-150k-by-june-30-2026",
    question: "Will Bitcoin hit $150k by June 30, 2026?",
    rawTags: ["Crypto"],
    currentPrices: { YES: 0.0135, NO: 0.9865 },
    volume24h: 5821652.894196,
  });

  const { holders, fetchedAt } = await api.listTopHolders(markets[0].conditionId);
  assert.match(fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(holders, [
    {
      wallet: "0xd235973291b2b75ff4070e9c0b01728c520b0f29",
      outcome: "YES",
      size: 1200,
      averageEntry: 0.02,
    },
  ]);
});

test("preference adapter maps KOL wallets and handles unavailable closed PnL", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId, args) => {
      if (capabilityId === "wallet.scrape.list_known_kols") {
        return {
          rows: [
            {
              address_normalized: "0xd235973291b2b75ff4070e9c0b01728c520b0f29",
              twitter_username: "macroAce",
              is_known_kol: true,
              smart_wallet: true,
              kol_sources: ["repo_smart_wallet"],
            },
          ],
        };
      }
      throw new Error(`Unexpected capability ${capabilityId}`);
    },
  });

  const { wallets } = await api.listKnownWallets();
  assert.deepEqual(wallets["0xd235973291b2b75ff4070e9c0b01728c520b0f29"], {
    knownHandle: "@macroAce",
    candidateSources: ["repo_smart_wallet", "smart_wallet", "known_kol"],
  });

  const { positions } = await api.listClosedPositions();
  const { marketTags } = await api.listClosedMarketTags();
  assert.deepEqual(positions, []);
  assert.deepEqual(marketTags, {});
  assert.deepEqual(api.getDiagnostics(), {
    requestedKolLimit: 100,
    requestedTrendingLimit: 12,
    requestedClosedPositionLimit: 250,
    knownWalletRows: 1,
    normalizedWallets: 1,
    pnlWalletsRequested: 0,
    pnlWalletsSucceeded: 0,
    pnlWalletsFailed: 0,
    rawPnlRows: 0,
    normalizedClosedPositions: 0,
    taggedClosedMarkets: 0,
    pnlErrors: [],
  });
});

test("preference adapter falls back to current top holders when known KOL list is empty", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId, args) => {
      if (capabilityId === "wallet.scrape.list_known_kols") return { rows: [] };
      if (capabilityId === "polymarket.discovery.search_markets" && args.query === "will") {
        return {
          markets: [
            {
              slug: "fed-cut-rates-2026",
              question: "Will the Fed cut rates in 2026?",
              volume24hr: 1000,
            },
          ],
        };
      }
      if (capabilityId === "polymarket.discovery.search_markets") {
        return {
          markets: [
            {
              slug: "fed-cut-rates-2026",
              question: "Will the Fed cut rates in 2026?",
              conditionId: "0xcondition",
              outcomes: ["Yes", "No"],
              outcomePrices: [0.42, 0.58],
              volume24hr: 1000,
            },
          ],
        };
      }
      if (capabilityId === "wallet.scrape.get_market_kol_holders") {
        return {
          holders_by_outcome: {
            Yes: [
              {
                address_normalized: "0xabc0000000000000000000000000000000000001",
                size: "100",
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected capability ${capabilityId}`);
    },
  });

  const { wallets } = await api.listKnownWallets();
  assert.deepEqual(wallets, {
    "0xabc0000000000000000000000000000000000001": {
      knownHandle: null,
      candidateSources: ["current_top_holder"],
    },
  });
  assert.equal(api.getDiagnostics().fallbackCandidateWallets, 1);
});

test("preference adapter can probe realized PnL payload shape", async () => {
  const api = new PreferenceMcpApi({ invokeCapability: async () => ({ rows: [] }) });

  const probe = await api.probeRealizedPnl("0xabc0000000000000000000000000000000000001");
  assert.equal(probe.parsedRowCount, 0);
  assert.equal(probe.payloadShape.type, "unavailable");
});

test("preference adapter can probe trending market payload shape", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId, args) => {
      assert.equal(capabilityId, "polymarket.discovery.search_markets");
      assert.equal(args.limit, 5);
      return {
        markets: [
          {
            slug: "will-bitcoin-hit-150k-by-june-30-2026",
            question: "Will Bitcoin hit $150k by June 30, 2026?",
          },
        ],
      };
    },
  });

  const probe = await api.probeTrendingMarkets();
  assert.equal(probe.parsedRowCount, 1);
  assert.deepEqual(probe.payloadShape.keys, ["markets"]);
  assert.equal(probe.firstRowSample.slug, "will-bitcoin-hit-150k-by-june-30-2026");
});
