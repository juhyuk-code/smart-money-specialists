const NOW = "2026-05-06T12:00:00.000Z";

export class MockPreferenceApi {
  async listKnownWallets() {
    return {
      wallets: {
        "0x1111000000000000000000000000000000000001": {
          knownHandle: "@weatherWhale",
          candidateSources: ["known_kol"],
        },
        "0x2222000000000000000000000000000000000002": {
          knownHandle: "@capitolEdge",
          candidateSources: ["known_kol"],
        },
        "0x3333000000000000000000000000000000000003": {
          knownHandle: null,
          candidateSources: ["top_holder_recent_market"],
        },
        "0x4444000000000000000000000000000000000004": {
          knownHandle: "@macroAce",
          candidateSources: ["known_kol", "top_holder_recent_market"],
        },
      },
    };
  }

  async listClosedPositions() {
    return {
      positions: [
        ...closedSet("0x1111000000000000000000000000000000000001", "weather", [380, 260, 240], [1800, 1200, 1100]),
        ...closedSet("0x2222000000000000000000000000000000000002", "politics", [1100, 900, 760, 500], [5000, 4300, 3800, 3200]),
        ...closedSet("0x3333000000000000000000000000000000000003", "crypto", [900, 850, 720, -150], [4500, 4200, 4000, 2000]),
        ...closedSet("0x4444000000000000000000000000000000000004", "macro", [700, 650, 500], [3100, 3000, 2400]),
      ],
    };
  }

  async listClosedMarketTags() {
    return {
      marketTags: {
        weather_0: ["Weather", "Hurricane"],
        weather_1: ["Weather", "Rain"],
        weather_2: ["Climate", "Temperature"],
        politics_0: ["US Election", "Politics"],
        politics_1: ["Senate", "Government"],
        politics_2: ["President", "Politics"],
        politics_3: ["Congress", "US Election"],
        crypto_0: ["Crypto", "Bitcoin"],
        crypto_1: ["Ethereum", "Crypto"],
        crypto_2: ["Solana", "Crypto"],
        crypto_3: ["Bitcoin", "Crypto"],
        macro_0: ["Federal Reserve", "Rates"],
        macro_1: ["Inflation", "CPI"],
        macro_2: ["GDP", "Economy"],
      },
    };
  }

  async listTrendingMarkets() {
    return {
      markets: [
        {
          conditionId: "weather-rain-nyc",
          slug: "nyc-rain-this-week",
          question: "Will New York City record rain this week?",
          rawTags: ["Weather", "Rain"],
          currentPrices: { YES: 0.22, NO: 0.78 },
          volume24h: 820000,
        },
        {
          conditionId: "election-senate-control",
          slug: "senate-control-after-election",
          question: "Will Democrats control the Senate after the next election?",
          rawTags: ["US Election", "Senate"],
          currentPrices: { YES: 0.48, NO: 0.52 },
          volume24h: 760000,
        },
        {
          conditionId: "fed-cut-2026",
          slug: "fed-cut-rates-2026",
          question: "Will the Fed cut interest rates before September 2026?",
          rawTags: ["Federal Reserve", "Rates"],
          currentPrices: { YES: 0.42, NO: 0.58 },
          volume24h: 640000,
        },
        {
          conditionId: "btc-hourly",
          slug: "bitcoin-up-or-down-hourly",
          question: "Bitcoin Up or Down - May 6, 1PM ET",
          rawTags: ["Crypto", "Bitcoin"],
          currentPrices: { UP: 0.51, DOWN: 0.49 },
          volume24h: 590000,
        },
        {
          conditionId: "eth-etf-volume",
          slug: "eth-etf-volume-billion",
          question: "Will Ethereum ETF volume exceed $1B this week?",
          rawTags: ["Crypto", "Ethereum"],
          currentPrices: { YES: 0.36, NO: 0.64 },
          volume24h: 430000,
        },
        {
          conditionId: "ai-model-release",
          slug: "major-ai-model-release",
          question: "Will a major AI lab release a frontier model this month?",
          rawTags: ["AI", "Technology"],
          currentPrices: { YES: 0.29, NO: 0.71 },
          volume24h: 310000,
        },
      ],
    };
  }

  async listTopHolders(conditionId) {
    const holders = {
      "weather-rain-nyc": [
        { wallet: "0x1111000000000000000000000000000000000001", outcome: "YES", size: 8200, averageEntry: 0.18 },
        { wallet: "0x9999000000000000000000000000000000000009", outcome: "NO", size: 7600, averageEntry: 0.81 },
      ],
      "election-senate-control": [
        { wallet: "0x2222000000000000000000000000000000000002", outcome: "NO", size: 5100, averageEntry: 0.61 },
        { wallet: "0x8888000000000000000000000000000000000008", outcome: "YES", size: 4900, averageEntry: 0.44 },
      ],
      "fed-cut-2026": [
        { wallet: "0x4444000000000000000000000000000000000004", outcome: "YES", size: 6800, averageEntry: 0.31 },
      ],
      "eth-etf-volume": [
        { wallet: "0x3333000000000000000000000000000000000003", outcome: "YES", size: 4200, averageEntry: null },
      ],
      "ai-model-release": [
        { wallet: "0x7777000000000000000000000000000000000007", outcome: "NO", size: 2000, averageEntry: 0.7 },
      ],
    };
    return { holders: holders[conditionId] ?? [], fetchedAt: NOW };
  }

  async resolvePolymarketUrl(url) {
    const { markets } = await this.listTrendingMarkets();
    const matched = markets.find((market) => url.includes(market.slug) || url.includes(market.conditionId));
    if (!matched) return { conditionIds: [], error: "unsupported" };
    return { conditionIds: [matched.conditionId], error: null };
  }
}

function closedSet(wallet, category, pnls, volumes) {
  return pnls.map((realizedPnl, index) => ({
    wallet,
    marketId: `${category}_${index}`,
    closed: true,
    realizedPnl,
    volume: volumes[index],
    isRecent90d: index < 2,
  }));
}
