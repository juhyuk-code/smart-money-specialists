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
      if (capabilityId === "pmmd__list_trending") {
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
      if (capabilityId === "pmdat__get_market") {
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
      if (capabilityId === "wsi__get_market_kol_holders") {
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

test("preference adapter maps KOL wallets and closed PnL payloads", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId) => {
      if (capabilityId === "wsi__list_known_kols") {
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
      if (capabilityId === "pmsg__get_subgraph_realized_pnl") {
        return {
          rows: [
            {
              condition_id: "0xmarket",
              title: "Will the Fed cut rates?",
              realized_pnl: "900",
              volume: "3000",
              timestamp: Math.floor(Date.now() / 1000),
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
  assert.equal(positions[0].wallet, "0xd235973291b2b75ff4070e9c0b01728c520b0f29");
  assert.equal(positions[0].realizedPnl, 900);
  assert.deepEqual(marketTags["0xmarket"], ["Macro"]);
  assert.deepEqual(api.getDiagnostics(), {
    requestedKolLimit: 250,
    requestedTrendingLimit: 50,
    requestedClosedPositionLimit: 250,
    knownWalletRows: 1,
    normalizedWallets: 1,
    pnlWalletsRequested: 1,
    pnlWalletsSucceeded: 1,
    pnlWalletsFailed: 0,
    rawPnlRows: 1,
    normalizedClosedPositions: 1,
    taggedClosedMarkets: 1,
    pnlErrors: [],
  });
});

test("preference adapter falls back to current top holders when known KOL list is empty", async () => {
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId) => {
      if (capabilityId === "wsi__list_known_kols") return { rows: [] };
      if (capabilityId === "pmmd__list_trending") {
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
      if (capabilityId === "pmdat__get_market") {
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
      if (capabilityId === "wsi__get_market_kol_holders") {
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
  const api = new PreferenceMcpApi({
    invokeCapability: async (capabilityId, args) => {
      assert.equal(capabilityId, "pmsg__get_subgraph_realized_pnl");
      assert.deepEqual(args, {
        account: "0xabc0000000000000000000000000000000000001",
        limit: 5,
      });
      return {
        rows: [
          {
            account: "0xabc0000000000000000000000000000000000001",
            condition_id: "0xmarket",
            realized_pnl: "25",
          },
        ],
      };
    },
  });

  const probe = await api.probeRealizedPnl("0xabc0000000000000000000000000000000000001");
  assert.equal(probe.parsedRowCount, 1);
  assert.equal(probe.firstRowSample.account, "0xabc0...0001");
  assert.deepEqual(probe.payloadShape.keys, ["rows"]);
});
