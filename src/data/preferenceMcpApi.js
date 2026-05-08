const CAPABILITIES = {
  listTrending: "polymarket.discovery.search_markets",
  getMarket: "polymarket.discovery.search_markets",
  listKnownKols: "wallet.scrape.list_known_kols",
  marketKolHolders: "wallet.scrape.get_market_kol_holders",
  kolIdentity: "wallet.scrape.get_kol_identity",
  realizedPnl: null,
};

const DEFAULT_KOL_LIMIT = 100;
const DEFAULT_TRENDING_LIMIT = 40;
const DEFAULT_HOLDER_LIMIT = 20;
const DEFAULT_IDENTITY_LOOKUP_LIMIT = 4;
const DEFAULT_CLOSED_POSITION_LIMIT = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

export class PreferenceMcpApi {
  constructor({
    invokeCapability,
    kolLimit = DEFAULT_KOL_LIMIT,
    trendingLimit = DEFAULT_TRENDING_LIMIT,
    closedPositionLimit = DEFAULT_CLOSED_POSITION_LIMIT,
    marketDiscovery = fetchGammaTopMarkets,
  } = {}) {
    if (typeof invokeCapability !== "function") {
      throw new Error("PreferenceMcpApi requires an invokeCapability function");
    }
    this.invokeCapability = invokeCapability;
    this.marketDiscovery = marketDiscovery;
    this.kolLimit = kolLimit;
    this.trendingLimit = trendingLimit;
    this.closedPositionLimit = closedPositionLimit;
    this.walletCache = null;
    this.closedPositionsCache = null;
    this.closedMarketTagsCache = null;
    this.marketCache = new Map();
    this.identityCache = new Map();
    this.diagnostics = {
      requestedKolLimit: kolLimit,
      requestedTrendingLimit: trendingLimit,
      requestedClosedPositionLimit: closedPositionLimit,
      knownWalletRows: 0,
      normalizedWallets: 0,
      pnlWalletsRequested: 0,
      pnlWalletsSucceeded: 0,
      pnlWalletsFailed: 0,
      rawPnlRows: 0,
      normalizedClosedPositions: 0,
      taggedClosedMarkets: 0,
      identityLookupsRequested: 0,
      identityLookupsSucceeded: 0,
      identityLookupsFailed: 0,
      identityLabelsResolved: 0,
      pnlErrors: [],
    };
  }

  async listKnownWallets() {
    if (this.walletCache) return this.walletCache;
    const payload = await this.invokeCapability(CAPABILITIES.listKnownKols, {
      limit: this.kolLimit,
      require_positions: true,
    });
    const rows = arrayFrom(payload, ["rows", "kols", "results", "data"]);
    this.diagnostics.knownWalletRows = rows.length;
    const wallets = {};

    for (const row of rows) {
      const wallet = normalizeWallet(row.address_normalized ?? row.address ?? row.wallet);
      if (!wallet) continue;
      wallets[wallet] = {
        knownHandle: bestHandle(row),
        candidateSources: candidateSources(row),
      };
    }

    if (Object.keys(wallets).length === 0) {
      const fallbackWallets = await this.listCurrentHolderWalletCandidates();
      Object.assign(wallets, fallbackWallets);
    }

    this.diagnostics.normalizedWallets = Object.keys(wallets).length;
    this.walletCache = { wallets };
    return this.walletCache;
  }

  async listCurrentHolderWalletCandidates() {
    const wallets = {};
    const { markets } = await this.listTrendingMarkets();
    const selectedMarkets = markets.slice(0, Math.min(markets.length, 25));
    this.diagnostics.fallbackCandidateMarketsRequested = selectedMarkets.length;

    await Promise.all(
      selectedMarkets.map(async (market) => {
        if (!market.conditionId) return;
        try {
          const { holders } = await this.listTopHolders(market.conditionId);
          for (const holder of holders) {
            wallets[holder.wallet] = {
              knownHandle: null,
              candidateSources: ["current_top_holder"],
            };
          }
        } catch (error) {
          if (!this.diagnostics.fallbackCandidateErrors) this.diagnostics.fallbackCandidateErrors = [];
          if (this.diagnostics.fallbackCandidateErrors.length < 8) {
            this.diagnostics.fallbackCandidateErrors.push({
              conditionId: market.conditionId,
              message: error?.message ?? String(error),
            });
          }
        }
      }),
    );

    this.diagnostics.fallbackCandidateWallets = Object.keys(wallets).length;
    return wallets;
  }

  async listClosedPositions() {
    if (this.closedPositionsCache) return this.closedPositionsCache;
    if (!CAPABILITIES.realizedPnl) {
      this.closedPositionsCache = { positions: [] };
      this.closedMarketTagsCache = { marketTags: {} };
      return this.closedPositionsCache;
    }

    const { wallets } = await this.listKnownWallets();
    const positions = [];
    const marketTags = {};

    await Promise.all(
      Object.keys(wallets).map(async (wallet) => {
        this.diagnostics.pnlWalletsRequested += 1;
        try {
          const payload = await this.invokeCapability(CAPABILITIES.realizedPnl, {
            account: wallet,
            limit: this.closedPositionLimit,
          });
          const rows = realizedPnlRows(payload);
          this.diagnostics.rawPnlRows += rows.length;
          for (const item of rows) {
            const position = normalizeClosedPosition(wallet, item);
            if (!position) continue;
            positions.push(position);
            marketTags[position.marketId] = inferTags(item);
          }
          this.diagnostics.pnlWalletsSucceeded += 1;
        } catch (error) {
          // Some upstream PnL subgraph queries can time out for active wallets.
          // Keep the adapter usable and let the registry audit show reduced coverage.
          this.diagnostics.pnlWalletsFailed += 1;
          if (this.diagnostics.pnlErrors.length < 8) {
            this.diagnostics.pnlErrors.push({
              wallet,
              message: error?.message ?? String(error),
            });
          }
        }
      }),
    );

    this.diagnostics.normalizedClosedPositions = positions.length;
    this.diagnostics.taggedClosedMarkets = Object.keys(marketTags).length;
    this.closedPositionsCache = { positions };
    this.closedMarketTagsCache = { marketTags };
    return this.closedPositionsCache;
  }

  async listClosedMarketTags() {
    if (!this.closedMarketTagsCache) await this.listClosedPositions();
    return this.closedMarketTagsCache;
  }

  async listTrendingMarkets() {
    const gammaMarkets = await this.marketDiscovery({ limit: this.trendingLimit });
    const normalizedGammaMarkets = gammaMarkets
      .map((market) => normalizeMarket(market))
      .filter(Boolean)
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));

    if (normalizedGammaMarkets.length > 0) {
      return { markets: normalizedGammaMarkets };
    }

    const payload = await this.invokeCapability(CAPABILITIES.listTrending, {
      query: "will",
      limit: this.trendingLimit,
      active: true,
      closed: false,
      order: "volume24hr",
      ascending: false,
      fields: marketSearchFields(),
    });
    const trending = arrayFrom(payload, ["markets", "results", "data"]);
    const slugs = trending.map((market) => market.slug).filter(Boolean);
    const detailed = slugs.length > 0 ? await this.fetchMarketsBySlugs(slugs) : [];
    const bySlug = new Map(detailed.map((market) => [market.slug, market]));
    const markets = trending.map((market) => normalizeMarket({ ...market, ...bySlug.get(market.slug) })).filter(Boolean);
    return { markets };
  }

  async listTopHolders(conditionId) {
    const fetchedAt = new Date().toISOString();
    const payload = await this.invokeCapability(CAPABILITIES.marketKolHolders, {
      condition_id: conditionId,
      limit: DEFAULT_HOLDER_LIMIT,
    });
    const holders = await this.enrichHolderIdentities(normalizeHolders(payload));
    return { holders, fetchedAt };
  }

  async enrichHolderIdentities(holders) {
    const targets = holders
      .filter((holder) => holder.wallet && !holder.knownHandle && !holder.displayLabel)
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, DEFAULT_IDENTITY_LOOKUP_LIMIT);

    const identities = await Promise.all(targets.map((holder) => this.resolveWalletIdentity(holder.wallet)));
    const byWallet = new Map(identities.filter(Boolean).map((identity) => [identity.wallet, identity]));

    return holders.map((holder) => {
      const identity = byWallet.get(holder.wallet);
      if (!identity) return holder;
      return {
        ...holder,
        displayLabel: holder.displayLabel ?? identity.displayLabel,
        knownHandle: holder.knownHandle ?? identity.knownHandle,
        identitySources: identity.sources,
      };
    });
  }

  async resolveWalletIdentity(walletValue) {
    const wallet = normalizeWallet(walletValue);
    if (!wallet) return null;
    if (this.identityCache.has(wallet)) return this.identityCache.get(wallet);

    this.diagnostics.identityLookupsRequested += 1;
    try {
      const payload = await this.invokeCapability(CAPABILITIES.kolIdentity, {
        address: wallet,
        limit: 5,
      });
      const identity = normalizeIdentity(payload, wallet);
      if (identity) {
        this.diagnostics.identityLabelsResolved += 1;
      }
      this.diagnostics.identityLookupsSucceeded += 1;
      this.identityCache.set(wallet, identity);
      return identity;
    } catch {
      this.diagnostics.identityLookupsFailed += 1;
      this.identityCache.set(wallet, null);
      return null;
    }
  }

  async resolvePolymarketUrl(url) {
    const slug = slugFromPolymarketUrl(url);
    if (!slug) return { conditionIds: [], error: "unsupported" };
    const markets = await this.fetchMarketsBySlugs([slug]);
    const conditionIds = markets.map((market) => market.conditionId).filter(Boolean);
    return {
      conditionIds,
      error: conditionIds.length > 0 ? null : "not_found",
    };
  }

  async fetchMarketsBySlugs(slugs) {
    const missing = slugs.filter((slug) => !this.marketCache.has(slug));
    if (missing.length > 0) {
      await Promise.all(missing.map(async (slug) => {
        const payload = await this.invokeCapability(CAPABILITIES.getMarket, {
          query: slug,
          limit: 5,
          active: true,
          closed: false,
          match_mode: "literal",
          match_fields: {
            question: false,
            description: false,
            slug: true,
            outcomes: false,
            category: false,
            tags: false,
          },
          fields: marketSearchFields(),
        });
        for (const market of arrayFrom(payload, ["markets", "results", "data"])) {
          const normalized = normalizeMarket(market);
          if (normalized?.slug) this.marketCache.set(normalized.slug, normalized);
        }
        const single = normalizeMarket(payload.market);
        if (single?.slug) this.marketCache.set(single.slug, single);
      }));

      const needsGammaPrices = missing.filter((slug) => {
        const market = this.marketCache.get(slug);
        return !market || Object.keys(market.currentPrices ?? {}).length === 0 || !market.conditionId;
      });
      if (needsGammaPrices.length > 0) {
        const gammaMarkets = await fetchGammaMarketsBySlugs(needsGammaPrices);
        for (const gammaMarket of gammaMarkets) {
          const normalized = normalizeMarket(gammaMarket);
          if (!normalized?.slug) continue;
          const existing = this.marketCache.get(normalized.slug);
          this.marketCache.set(normalized.slug, mergeMarketMetadata(existing, normalized));
        }
      }

      for (const slug of missing) {
        if (!this.marketCache.has(slug)) {
          const normalized = normalizeMarket({ slug });
          if (normalized?.slug) this.marketCache.set(normalized.slug, normalized);
        }
      }
    }
    return slugs.map((slug) => this.marketCache.get(slug)).filter(Boolean);
  }

  getDiagnostics() {
    return this.diagnostics;
  }

  async probeRealizedPnl(wallet) {
    if (!CAPABILITIES.realizedPnl) {
      return {
        capability: null,
        argumentKeys: ["account", "limit"],
        payloadShape: { type: "unavailable", sample: "No realized PnL tool is currently exposed by Preference MCP." },
        parsedRowCount: 0,
        firstRowShape: { type: "undefined", sample: null },
        firstRowSample: null,
      };
    }

    const payload = await this.invokeCapability(CAPABILITIES.realizedPnl, {
      account: wallet,
      limit: 5,
    });
    const rows = realizedPnlRows(payload);
    return {
      capability: CAPABILITIES.realizedPnl,
      argumentKeys: ["account", "limit"],
      payloadShape: describeValue(payload),
      parsedRowCount: rows.length,
      firstRowShape: describeValue(rows[0]),
      firstRowSample: redactSample(rows[0]),
    };
  }

  async probeTrendingMarkets() {
    const payload = await this.invokeCapability(CAPABILITIES.listTrending, {
      query: "will",
      limit: 5,
      active: true,
      closed: false,
      order: "volume24hr",
      ascending: false,
    });
    const rows = arrayFrom(payload, ["markets", "results", "data"]);
    return {
      capability: CAPABILITIES.listTrending,
      argumentKeys: ["limit", "active", "closed", "order", "ascending"],
      payloadShape: describeValue(payload),
      parsedRowCount: rows.length,
      firstRowShape: describeValue(rows[0]),
      firstRowSample: redactSample(rows[0]),
    };
  }
}

export class PreferenceMcpHttpClient {
  constructor({ url = process.env.PREFERENCE_MCP_URL, token = process.env.PREFERENCE_MCP_TOKEN } = {}) {
    if (!url) throw new Error("Set PREFERENCE_MCP_URL to use DATA_SOURCE=preference");
    this.url = url;
    this.token = token;
    this.nextId = 1;
    this.capabilityCallMode = null;
  }

  async invokeCapability(capabilityId, args = {}) {
    if (!capabilityId) throw new Error("Preference MCP capability is unavailable");

    const calls = [
      {
        mode: "direct_tool_call",
        name: capabilityId,
        args,
      },
      {
        mode: "tool_ref_call_tool",
        name: "call_tool",
        args: { tool_ref: capabilityId, arguments: args },
      },
    ];

    const orderedCalls = this.capabilityCallMode
      ? [...calls.filter((call) => call.mode === this.capabilityCallMode), ...calls.filter((call) => call.mode !== this.capabilityCallMode)]
      : calls;
    const errors = [];

    for (const call of orderedCalls) {
      try {
        const result = await this.callTool(call.name, call.args);
        this.capabilityCallMode = call.mode;
        return result;
      } catch (error) {
        errors.push(error?.message ?? String(error));
        if (!isCapabilityDispatchError(error)) throw error;
      }
    }

    throw new Error(errors.at(-1) ?? "Preference MCP capability call failed");
  }

  async callTool(name, args) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`Preference MCP request failed (${response.status}): ${text}`);
    const message = parseMcpResponse(text);
    if (message.error) throw new Error(message.error.message ?? "Preference MCP returned an error");
    return unwrapToolResult(message.result);
  }
}

export function createPreferenceMcpApiFromEnv() {
  const client = new PreferenceMcpHttpClient();
  return new PreferenceMcpApi({
    invokeCapability: (capabilityId, args) => client.invokeCapability(capabilityId, args),
    kolLimit: numberFromEnv("PREFERENCE_KOL_LIMIT", DEFAULT_KOL_LIMIT),
    trendingLimit: numberFromEnv("PREFERENCE_TRENDING_LIMIT", DEFAULT_TRENDING_LIMIT),
    closedPositionLimit: numberFromEnv("PREFERENCE_CLOSED_POSITION_LIMIT", DEFAULT_CLOSED_POSITION_LIMIT),
  });
}

function normalizeMarket(market) {
  if (!market) return null;
  const outcomes = parseArray(market.outcomes);
  const prices = parseArray(market.outcomePrices ?? market.outcome_prices ?? market.prices);
  const currentPrices = normalizeCurrentPrices(market.currentPrices ?? market.current_prices);
  outcomes.forEach((outcome, index) => {
    const price = toNumber(prices[index]);
    if (outcome && typeof price === "number") currentPrices[String(outcome).toUpperCase()] = price;
  });
  return {
    conditionId: market.conditionId ?? market.condition_id ?? market.conditionID ?? market.condition ?? null,
    slug: market.slug ?? null,
    question: market.question ?? market.title ?? "",
    rawTags: inferTags(market),
    currentPrices,
    volume24h: toNumber(market.volume24hr ?? market.volume24h ?? market.volume_24h ?? market.volumeNum ?? market.volume),
  };
}

function marketSearchFields() {
  return {
    question: true,
    outcomes: true,
    outcomePrices: true,
    prices: true,
    volume: true,
    volume24hr: true,
    category: true,
    subcategory: true,
    conditionId: true,
  };
}

function normalizeCurrentPrices(value) {
  const prices = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return prices;
  for (const [outcome, priceValue] of Object.entries(value)) {
    const price = toNumber(priceValue);
    if (typeof price === "number") prices[String(outcome).toUpperCase()] = price;
  }
  return prices;
}

function mergeMarketMetadata(existing, incoming) {
  if (!existing) return incoming;
  return {
    conditionId: existing.conditionId ?? incoming.conditionId,
    slug: existing.slug ?? incoming.slug,
    question: existing.question || incoming.question,
    rawTags: existing.rawTags?.length ? existing.rawTags : incoming.rawTags,
    currentPrices: Object.keys(incoming.currentPrices ?? {}).length > 0 ? incoming.currentPrices : existing.currentPrices,
    volume24h: existing.volume24h ?? incoming.volume24h,
  };
}

async function fetchGammaTopMarkets({ limit }) {
  try {
    const url = new URL("https://gamma-api.polymarket.com/markets");
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("archived", "false");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order", "volume24hr");
    url.searchParams.set("ascending", "false");

    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return [];
    return parseArray(await response.json());
  } catch {
    return [];
  }
}

async function fetchGammaMarketsBySlugs(slugs) {
  const results = await mapWithConcurrency(slugs, 8, async (slug) => {
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) return [];
      return parseArray(await response.json());
    } catch {
      return [];
    }
  });
  return results.flat();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function normalizeClosedPosition(wallet, item) {
  const realizedPnl = toNumber(item.realizedPnl ?? item.realized_pnl ?? item.pnl ?? item.profit);
  if (typeof realizedPnl !== "number") return null;
  const marketId =
    item.marketId ?? item.market_id ?? item.conditionId ?? item.condition_id ?? item.tokenId ?? item.token_id ?? item.id;
  if (!marketId) return null;
  return {
    wallet,
    marketId: String(marketId),
    closed: true,
    realizedPnl,
    volume: toNumber(item.volume ?? item.size ?? item.amount ?? item.costBasis ?? item.cost_basis) ?? Math.abs(realizedPnl),
    isRecent90d: isRecent90d(item.timestamp ?? item.updatedAt ?? item.updated_at ?? item.closedAt ?? item.closed_at),
  };
}

function normalizeHolders(payload) {
  const holders = [];
  const grouped = payload?.holders_by_outcome ?? payload?.holdersByOutcome;
  if (grouped && typeof grouped === "object") {
    for (const [outcome, rows] of Object.entries(grouped)) {
      for (const row of parseArray(rows)) {
        const holder = normalizeHolder(row, outcome);
        if (holder) holders.push(holder);
      }
    }
  }

  for (const row of arrayFrom(payload, ["holders", "rows", "data"])) {
    const holder = normalizeHolder(row, row.outcome);
    if (holder) holders.push(holder);
  }

  for (const market of arrayFrom(payload, ["markets"])) {
    for (const row of parseArray(market.top_known_kols ?? market.topKnownKols)) {
      const holder = normalizeHolder(row, row.outcome);
      if (holder) holders.push(holder);
    }
  }

  return holders;
}

function normalizeHolder(row, fallbackOutcome) {
  const wallet = normalizeWallet(row.address_normalized ?? row.address ?? row.wallet);
  if (!wallet) return null;
  const knownHandle = bestHandle(row);
  return {
    wallet,
    displayLabel: bestDisplayLabel(row) ?? knownHandle,
    knownHandle,
    outcome: String(row.outcome ?? row.side ?? fallbackOutcome ?? "UNKNOWN").toUpperCase(),
    size: toNumber(row.size ?? row.balance ?? row.shares ?? row.total_value_usd ?? row.value) ?? 0,
    averageEntry: toNumber(row.averageEntry ?? row.average_entry ?? row.avg_entry ?? row.avgPrice ?? row.avg_price),
  };
}

function normalizeIdentity(payload, wallet) {
  const rows = [
    ...arrayFrom(payload, ["people", "identities", "results", "rows", "data", "matches"]),
    payload?.person,
    payload?.identity,
    payload?.profile,
    payload,
  ].filter((row) => row && typeof row === "object");

  for (const row of rows) {
    const nested = [row, row.person, row.identity, row.profile].filter(Boolean);
    for (const candidate of nested) {
      const knownHandle = bestHandle(candidate);
      const displayLabel = bestDisplayLabel(candidate) ?? knownHandle;
      if (!displayLabel && !knownHandle) continue;
      return {
        wallet,
        displayLabel,
        knownHandle,
        sources: candidateSources(candidate),
      };
    }
  }

  return null;
}

function realizedPnlRows(payload) {
  return arrayFrom(payload, ["positions", "realized_pnl", "realizedPnl", "rows", "data", "events"]);
}

function bestHandle(row) {
  const handle =
    row?.knownHandle ??
    row?.known_handle ??
    row?.twitter_username ??
    row?.x_username ??
    row?.screen_name ??
    row?.handle ??
    row?.username ??
    row?.primary_kol_name;
  if (!handle) return null;
  const value = String(handle).trim();
  if (!value || /^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value.startsWith("@") ? value : `@${value}`;
}

function bestDisplayLabel(row) {
  const value =
    row?.displayLabel ??
    row?.display_label ??
    row?.display_name ??
    row?.label ??
    row?.name ??
    row?.primary_kol_name;
  if (!value) return null;
  const label = String(value).trim();
  if (!label || /^0x[a-fA-F0-9]{40}$/.test(label)) return null;
  return label;
}

function candidateSources(row) {
  const sources = new Set([
    ...parseArray(row?.kol_sources),
    ...parseArray(row?.sources),
    ...parseArray(row?.identity_sources),
  ]);
  if (row?.smart_wallet) sources.add("smart_wallet");
  if (row?.is_known_kol) sources.add("known_kol");
  if (sources.size === 0) sources.add("preference_mcp");
  return [...sources];
}

function inferTags(item) {
  const explicit = [
    ...parseArray(item?.tags),
    ...parseArray(item?.rawTags),
    ...parseArray(item?.categories),
    ...parseArray(item?.smart_wallet_tags),
  ].filter(Boolean);
  const text = [item?.question, item?.title, item?.description, item?.slug, ...explicit].filter(Boolean).join(" ");
  const tags = [...explicit];
  const rules = [
    ["Politics", /\b(election|president|senate|congress|trump|biden|iran|government|politic)\b/i],
    ["Sports", /\b(nba|nfl|mlb|nhl|soccer|football|ufc|tennis|sports?)\b/i],
    ["Weather", /\b(weather|hurricane|temperature|rain|snow|storm|climate)\b/i],
    ["Crypto", /\b(crypto|bitcoin|btc|ethereum|eth|solana|xrp|doge)\b/i],
    ["Macro", /\b(fed|federal reserve|inflation|cpi|gdp|rates?|macro|economy|unemployment)\b/i],
    ["Technology", /\b(ai|openai|space|spacex|science|technology|tech|nasa|robot|chip)\b/i],
  ];
  for (const [tag, pattern] of rules) {
    if (pattern.test(text) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function slugFromPolymarketUrl(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)polymarket\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => ["event", "market"].includes(part));
    return parts[markerIndex + 1] ?? parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function arrayFrom(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    const parsed = parseArray(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeWallet(value) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(value ?? ""))) return null;
  return String(value).toLowerCase();
}

function isRecent90d(value) {
  if (!value) return false;
  const timestamp = typeof value === "number" ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= 90 * DAY_MS;
}

function parseMcpResponse(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  const dataLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  if (!dataLine) throw new Error("Preference MCP returned an unrecognized response");
  return JSON.parse(dataLine.slice("data:".length).trim());
}

function unwrapToolResult(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return result;
  const text = content.find((item) => item.type === "text")?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function isCapabilityDispatchError(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("invoke_capability") ||
    message.includes("call_tool") ||
    message.includes("invalid params") ||
    message.includes("unknown tool") ||
    message.includes("not found") ||
    message.includes("missing") ||
    message.includes("required")
  );
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function describeValue(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: describeValue(value[0]),
    };
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).slice(0, 20);
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 30),
      fields: Object.fromEntries(entries.map(([key, fieldValue]) => [key, describeValueShallow(fieldValue)])),
    };
  }
  return describeValueShallow(value);
}

function describeValueShallow(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 12) };
  return { type: typeof value, sample: value === undefined ? null : String(value).slice(0, 80) };
}

function redactSample(value) {
  if (!value || typeof value !== "object") return value ?? null;
  const sample = {};
  for (const [key, fieldValue] of Object.entries(value).slice(0, 20)) {
    if (/address|wallet|account/i.test(key) && typeof fieldValue === "string") {
      sample[key] = `${fieldValue.slice(0, 6)}...${fieldValue.slice(-4)}`;
    } else {
      sample[key] = fieldValue;
    }
  }
  return sample;
}
